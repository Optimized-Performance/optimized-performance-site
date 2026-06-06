// PayPal Orders v2 — redirect-style flow matching the cardProcessor shape.
//
// Flow:
//   1. createPaypalCheckoutSession() → POSTs /v2/checkout/orders with
//      intent=CAPTURE, custom_id = our orderNumber. Returns the approve_url
//      for the customer to redirect to.
//   2. Customer approves on paypal.com → PayPal redirects to return_url.
//   3. Async webhook CHECKOUT.ORDER.APPROVED → server captures the order via
//      capturePaypalOrder() (webhook handler invokes this).
//   4. Async webhook PAYMENT.CAPTURE.COMPLETED → finalizePaidOrder() runs.
//
// Sandbox vs live is selected by PAYPAL_ENV=sandbox|live (default sandbox so a
// missing env var can never accidentally charge real cards).

const PAYPAL_LIVE_BASE = 'https://api-m.paypal.com'
const PAYPAL_SANDBOX_BASE = 'https://api-m.sandbox.paypal.com'

function paypalBaseUrl() {
  if (process.env.PAYPAL_API_BASE) return process.env.PAYPAL_API_BASE
  return process.env.PAYPAL_ENV === 'live' ? PAYPAL_LIVE_BASE : PAYPAL_SANDBOX_BASE
}

// Module-level token cache. PayPal client-credentials tokens are valid ~9h,
// but we were minting a fresh one on EVERY order — a second PayPal round-trip
// sitting inside the Smart-Buttons createOrder window, which is part of what
// caused the "pay screen timed out" failures (the popup couldn't open before
// PayPal's patience ran out). Caching reuses the token across orders within a
// warm serverless instance, removing that round-trip from the critical path.
// Persists per warm instance; a cold/new instance just mints its own. No
// cross-instance store needed for this win.
let _tokenCache = { token: null, expiresAt: 0 }

async function getAccessToken() {
  const now = Date.now()
  // Reuse until 60s before expiry (clock-skew + in-flight safety margin).
  if (_tokenCache.token && now < _tokenCache.expiresAt - 60_000) {
    return _tokenCache.token
  }

  const clientId = process.env.PAYPAL_CLIENT_ID
  const secret = process.env.PAYPAL_CLIENT_SECRET
  if (!clientId || !secret) {
    throw new Error('[paypal] PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET not configured')
  }
  const basic = Buffer.from(`${clientId}:${secret}`).toString('base64')
  const res = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = null }
  if (!res.ok || !data?.access_token) {
    throw new Error(`[paypal] OAuth token failed (${res.status}): ${text.slice(0, 400)}`)
  }
  // expires_in is seconds (~32400 = 9h); default to 8h if PayPal omits it.
  const ttlMs = (Number(data.expires_in) > 0 ? Number(data.expires_in) : 28800) * 1000
  _tokenCache = { token: data.access_token, expiresAt: now + ttlMs }
  return data.access_token
}

export async function createPaypalCheckoutSession({ orderNumber, amountCents, currency, customer, returnUrl, cancelUrl }) {
  const accessToken = await getAccessToken()

  const body = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: orderNumber,
        custom_id: orderNumber,
        description: `Optimized Performance Inc. order ${orderNumber}`,
        amount: {
          currency_code: (currency || 'USD').toUpperCase(),
          value: (amountCents / 100).toFixed(2),
        },
      },
    ],
    application_context: {
      brand_name: 'Optimized Performance',
      user_action: 'PAY_NOW',
      shipping_preference: 'NO_SHIPPING',
      return_url: returnUrl,
      cancel_url: cancelUrl,
    },
  }
  if (customer?.email) body.payer = { email_address: customer.email }

  const res = await fetch(`${paypalBaseUrl()}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      // PayPal recommends a request-id for idempotency on retried creates.
      'PayPal-Request-Id': `create-${orderNumber}`,
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = null }
  if (!res.ok || !data) {
    throw new Error(`[paypal] orders create failed (${res.status}): ${text.slice(0, 500)}`)
  }
  const approveLink = Array.isArray(data.links) ? data.links.find((l) => l.rel === 'approve') : null
  if (!approveLink?.href) {
    throw new Error(`[paypal] orders create missing approve link. body=${text.slice(0, 400)}`)
  }
  return { redirectUrl: approveLink.href, paypalOrderId: data.id }
}

// Called by the webhook handler in response to CHECKOUT.ORDER.APPROVED. PayPal
// will then fire PAYMENT.CAPTURE.COMPLETED, which is what triggers our
// finalizePaidOrder pipeline.
export async function capturePaypalOrder({ paypalOrderId }) {
  const accessToken = await getAccessToken()
  const res = await fetch(`${paypalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': `capture-${paypalOrderId}`,
    },
    body: '{}',
  })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = null }

  // 422 ORDER_ALREADY_CAPTURED is benign — earlier webhook delivery captured it.
  if (res.status === 422 && /ORDER_ALREADY_CAPTURED/i.test(text)) {
    return { ok: true, alreadyCaptured: true }
  }
  if (!res.ok || !data) {
    throw new Error(`[paypal] order capture failed (${res.status}): ${text.slice(0, 500)}`)
  }
  return { ok: true, captureStatus: data.status }
}

// PayPal verifies webhook signatures by POSTing the received headers + parsed
// body back to /v1/notifications/verify-webhook-signature with the configured
// webhook_id. Returns verification_status: "SUCCESS" | "FAILURE".
export async function parsePaypalWebhookEvent({ rawBody, headers }) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID
  if (!webhookId) return { verified: false, reason: 'PAYPAL_WEBHOOK_ID not configured' }

  const transmissionId = headers['paypal-transmission-id']
  const transmissionTime = headers['paypal-transmission-time']
  const transmissionSig = headers['paypal-transmission-sig']
  const certUrl = headers['paypal-cert-url']
  const authAlgo = headers['paypal-auth-algo']
  if (!transmissionId || !transmissionTime || !transmissionSig || !certUrl || !authAlgo) {
    return { verified: false, reason: 'Missing PayPal webhook headers' }
  }

  let webhookEvent
  try { webhookEvent = JSON.parse(rawBody) } catch {
    return { verified: false, reason: 'Invalid JSON body' }
  }

  let accessToken
  try { accessToken = await getAccessToken() } catch (err) {
    return { verified: false, reason: `OAuth failed: ${err.message}` }
  }

  const verifyRes = await fetch(`${paypalBaseUrl()}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: webhookId,
      webhook_event: webhookEvent,
    }),
  })
  const verifyText = await verifyRes.text()
  let verifyData
  try { verifyData = JSON.parse(verifyText) } catch { verifyData = null }
  if (!verifyRes.ok || verifyData?.verification_status !== 'SUCCESS') {
    return { verified: false, reason: `verify-webhook-signature: ${verifyData?.verification_status || verifyRes.status}` }
  }

  const eventType = webhookEvent.event_type || ''
  const resource = webhookEvent.resource || {}

  if (eventType === 'CHECKOUT.ORDER.APPROVED') {
    // Order ID is the PayPal order, custom_id on the purchase unit is our
    // internal order number. Caller will trigger capturePaypalOrder().
    const paypalOrderId = resource.id || ''
    const orderNumber = resource.purchase_units?.[0]?.custom_id || resource.purchase_units?.[0]?.reference_id || ''
    return {
      verified: true,
      eventId: webhookEvent.id,
      status: 'approved_pending_capture',
      paypalOrderId,
      orderNumber,
    }
  }

  if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
    const txId = resource.id || ''
    const orderNumber = resource.custom_id || ''
    const eventId = webhookEvent.id
    return {
      verified: true,
      eventId,
      txId,
      orderNumber,
      status: 'completed',
    }
  }

  if (
    eventType === 'PAYMENT.CAPTURE.DENIED' ||
    eventType === 'PAYMENT.CAPTURE.DECLINED' ||
    eventType === 'CHECKOUT.ORDER.VOIDED' ||
    eventType === 'CHECKOUT.PAYMENT-APPROVAL.REVERSED'
  ) {
    const txId = resource.id || ''
    const orderNumber = resource.custom_id || resource.purchase_units?.[0]?.custom_id || ''
    return {
      verified: true,
      eventId: webhookEvent.id,
      txId,
      orderNumber,
      status: 'failed',
    }
  }

  // PAYMENT.CAPTURE.PENDING means PayPal accepted the capture but is still
  // reviewing (e.g. risk hold, eCheck clearing). No order action — wait for a
  // later COMPLETED or DENIED. Surface as ignored so the handler logs it
  // distinctly from the unhandled-event noop branch below.
  if (eventType === 'PAYMENT.CAPTURE.PENDING') {
    const orderNumber = resource.custom_id || ''
    return {
      verified: true,
      eventId: webhookEvent.id,
      txId: resource.id || '',
      orderNumber,
      status: 'noop',
      ignore: true,
      reason: 'capture_pending — awaiting PayPal review',
    }
  }

  // Refunds and anything else not in our subscribed set — log and no-op.
  // Refund flow is admin-driven via /api/admin/orders/refund.
  return {
    verified: true,
    eventId: webhookEvent.id,
    status: 'noop',
    ignore: true,
    reason: `Unhandled event type: ${eventType}`,
  }
}
