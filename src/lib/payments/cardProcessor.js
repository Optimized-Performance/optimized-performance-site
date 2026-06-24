import crypto from 'crypto'

// Active card processor. NO default fallback — Bankful was MATCH-terminated
// (2026-05-12), so a missing/unknown CARD_PROCESSOR must FAIL CLOSED, never
// silently route a card to a dead rail (which is exactly what happened the
// first time CARD_PROCESSOR was unset — the order hit Bankful's hosted page).
// Only 'noramp' (the Whop-approved gateway) is supported; add new rails here
// explicitly, deliberately.
const PROCESSOR = process.env.CARD_PROCESSOR || ''

function assertSupportedProcessor() {
  if (PROCESSOR !== 'noramp') {
    throw new Error(
      `[cardProcessor] CARD_PROCESSOR must be 'noramp' (got: ${PROCESSOR || 'unset'}). ` +
        'No default fallback — Bankful is terminated.'
    )
  }
}

export async function createCheckoutSession(opts) {
  assertSupportedProcessor()
  return norampCreateSession(opts)
}

export async function parseWebhookEvent({ rawBody, headers }) {
  assertSupportedProcessor()
  return norampParseWebhook({ rawBody, headers })
}

// Poll the gateway for a session's payment status (missed-callback safety net).
// Returns { paid, status } and never throws.
export async function reconcileCardSession(opts) {
  assertSupportedProcessor()
  return norampReconcileSession(opts)
}

// ── NoRamp gateway (Whop-approved durable card rail) ──────────────────────────
// Hosted-checkout (redirect) flow, ported 1:1 from the merchant WooCommerce
// plugin (payment-gateway-woocommerce, scm_* fns): POST /checkout/sessions with
// a Bearer merchant token → { checkout_url, session_id }; customer pays on the
// gateway-hosted page; NoRamp POSTs a signed callback to /api/webhooks/noramp.
// Inline/Elements (payment-intents + Stripe.js w/ connected account) is the
// other experience — deferred to keep the money path small + off our PCI
// surface. Statement descriptor (SYNGYN) is configured gateway-side.
const NORAMP_LIVE_BASE = 'https://api.noramp.dev'

function norampBaseUrl() {
  return process.env.NORAMP_API_BASE || NORAMP_LIVE_BASE
}

async function norampCreateSession({ orderNumber, amountCents, currency, customer, returnUrl, cancelUrl }) {
  const token = process.env.NORAMP_MERCHANT_TOKEN
  if (!token) throw new Error('[noramp] NORAMP_MERCHANT_TOKEN not configured')

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''
  const fullName = (customer?.name || '').trim()
  const total = (amountCents / 100).toFixed(2)
  const order = {
    id: String(orderNumber),
    number: String(orderNumber),
    key: String(orderNumber),
    currency: (currency || 'USD').toLowerCase(),
    total,
    // NoRamp requires >=1 payable line item (else 400 "No payable line items").
    // Send ONE neutral item = the order total: keeps the RUO posture (processor
    // gets order # + amount, never product names) and avoids per-item
    // restricted-name screening.
    items: [
      {
        name: `Order ${orderNumber}`,
        product_id: String(orderNumber),
        quantity: 1,
        subtotal: total,
        total,
        tax: '0',
      },
    ],
    customer: {
      email: customer?.email || '',
      first_name: customer?.firstName || fullName.split(' ')[0] || '',
      last_name: customer?.lastName || fullName.split(' ').slice(1).join(' ') || '',
      phone: customer?.phone || '',
    },
    billing: {
      address_1: customer?.address || '',
      city: customer?.city || '',
      state: customer?.state || '',
      postcode: customer?.zip || '',
      country: customer?.country || 'US',
    },
  }

  const body = {
    order,
    success_url: returnUrl,
    cancel_url: cancelUrl,
    callback_url: `${siteUrl}/api/webhooks/noramp`,
    source: 'syngyn',
  }

  const res = await fetch(`${norampBaseUrl()}/checkout/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  })

  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = null }

  if (!res.ok || !data) {
    throw new Error(`[noramp] /checkout/sessions failed (${res.status}): ${text.slice(0, 500)}`)
  }

  const redirectUrl = data.checkout_url || data.url
  if (!redirectUrl) {
    throw new Error(`[noramp] no checkout_url in response: ${text.slice(0, 400)}`)
  }
  const sessionId = data.session_id || data.id || ''
  return { redirectUrl, sessionId }
}

// Callback signature (verbatim from plugin scm_validate_callback_signature):
//   token_hash = sha256_hex(merchant_token)
//   expected   = hmac_sha256_hex(rawBody, key = token_hash)   // key is the hex string
//   valid      = timingSafeEqual(expected, X-Platform-Signature)
async function norampParseWebhook({ rawBody, headers }) {
  const token = process.env.NORAMP_MERCHANT_TOKEN
  if (!token) return { verified: false, reason: 'NORAMP_MERCHANT_TOKEN not configured' }

  const signature = headers['x-platform-signature']
  if (!signature) return { verified: false, reason: 'Missing X-Platform-Signature' }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const expected = Buffer.from(crypto.createHmac('sha256', tokenHash).update(rawBody).digest('hex'))
  const received = Buffer.from(String(signature))
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    return { verified: false, reason: 'Signature mismatch' }
  }

  let body
  try { body = JSON.parse(rawBody) } catch { return { verified: false, reason: 'Invalid JSON payload' } }

  const event = String(body.event || '')
  if (event === 'connection.test') {
    return { verified: true, ignore: true, reason: 'connection_test' }
  }

  const orderNumber = String(
    body.woo_order_id || body.order_id || body.order?.id || body.order?.number || ''
  )
  const paymentId = String(body.payment_id || body.payment_intent_id || body.session_id || '')

  let status = 'pending'
  if (['payment.succeeded', 'checkout.session.completed'].includes(event)) status = 'completed'
  else if (['payment.failed', 'checkout.session.expired'].includes(event)) status = 'failed'

  const eventId = paymentId ? `${orderNumber}-${paymentId}` : `${orderNumber}-${String(signature).slice(0, 16)}`

  return { verified: true, eventId, txId: paymentId, orderNumber, status }
}

// Missed-callback safety net: POST /checkout/sessions/{id}/reconcile (per the
// merchant plugin's reconcile flow) → { payment_status }. Used by the success
// return + the expire-awaiting cron so a dropped/late callback can't strand a
// paid order as "awaiting payment" or get it wrongly abandoned. Never throws.
async function norampReconcileSession({ sessionId, orderNumber, orderKey }) {
  const token = process.env.NORAMP_MERCHANT_TOKEN
  if (!token || !sessionId) return { paid: false, status: 'no_session' }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''
  try {
    const res = await fetch(
      `${norampBaseUrl()}/checkout/sessions/${encodeURIComponent(sessionId)}/reconcile`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          woo_order_id: String(orderNumber || ''),
          woo_order_key: String(orderKey || orderNumber || ''),
          callback_url: `${siteUrl}/api/webhooks/noramp`,
        }),
      }
    )
    const text = await res.text()
    let data
    try { data = JSON.parse(text) } catch { data = null }
    if (!res.ok || !data) {
      return { paid: false, status: 'error', error: `(${res.status}) ${text.slice(0, 200)}` }
    }
    const status = String(data.payment_status || '')
    const paymentId = String(data.payment_id || data.payment_intent_id || data.session_id || sessionId)
    return { paid: status === 'paid', status: status || 'unknown', paymentId }
  } catch (err) {
    return { paid: false, status: 'error', error: err.message }
  }
}
