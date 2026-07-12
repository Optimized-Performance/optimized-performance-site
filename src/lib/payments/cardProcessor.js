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

// Which card checkout experience the customer gets. 'redirect' (default) =
// the gateway-hosted page; 'inline' = on-site Payment Element via
// /payment-intents (fully Syngyn-branded, card data stays inside Stripe's
// iframes so our PCI surface is unchanged). Server-side flag only — the
// checkout client keys off the create-response shape (card_intent vs
// redirect_url), so flipping this env var + redeploy is the entire rollback.
export function cardCheckoutExperience() {
  return process.env.CARD_EXPERIENCE === 'inline' ? 'inline' : 'redirect'
}

export async function createCardPaymentIntent(opts) {
  assertSupportedProcessor()
  return norampCreatePaymentIntent(opts)
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
// The inline experience (CARD_EXPERIENCE=inline) instead POSTs
// /payment-intents and renders Stripe's Payment Element ON the checkout page
// under the connected account — fully branded, card data never touches our
// servers (stays inside Stripe's iframes). Both experiences share the same
// webhook + reconcile safety net; reconcile routes by id prefix (pi_… →
// payment-intents, else checkout sessions). Statement descriptor (SYNGYN) is
// configured gateway-side.
const NORAMP_LIVE_BASE = 'https://api.noramp.dev'

function norampBaseUrl() {
  return process.env.NORAMP_API_BASE || NORAMP_LIVE_BASE
}

// RUO business context sent with payment intents (verbatim from the merchant
// plugin's scm_ruo_business_context) — the platform's screening posture for
// research-supplier merchants. Order payloads stay product-name-free either way.
function norampRuoContext() {
  return {
    company_name: '',
    buyer_company: '',
    buyer_type: 'business_or_lab',
    use_case: 'in_vitro_research',
    product_category: 'ruo_reference_materials',
    site_acknowledgment: 'research_use_only',
    not_for_consumption_acknowledged: true,
    coa_available: true,
    shipping_contains: 'research_materials',
  }
}

// Shared order payload for both checkout experiences (sessions + intents).
function buildNorampOrder({ orderNumber, amountCents, currency, customer }) {
  const fullName = (customer?.name || '').trim()
  const total = (amountCents / 100).toFixed(2)
  return {
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
}

async function norampCreateSession({ orderNumber, amountCents, currency, customer, returnUrl, cancelUrl }) {
  const token = process.env.NORAMP_MERCHANT_TOKEN
  if (!token) throw new Error('[noramp] NORAMP_MERCHANT_TOKEN not configured')

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''
  const order = buildNorampOrder({ orderNumber, amountCents, currency, customer })

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

// Inline experience: create a platform payment intent (plugin flow: POST
// /payment-intents with inline_blocks + disable_redirects) → the client mounts
// Stripe's Payment Element with the returned client_secret under the returned
// connected account. idempotency_key is keyed on the order number so a retry
// of the same order (pay-screen timeout, resumed order) reuses one intent
// instead of minting parallel charges.
async function norampCreatePaymentIntent({ orderNumber, amountCents, currency, customer, returnUrl, cancelUrl }) {
  const token = process.env.NORAMP_MERCHANT_TOKEN
  if (!token) throw new Error('[noramp] NORAMP_MERCHANT_TOKEN not configured')

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''
  const checkoutId = `syngyn_${orderNumber}`

  const body = {
    order: buildNorampOrder({ orderNumber, amountCents, currency, customer }),
    success_url: returnUrl,
    cancel_url: cancelUrl,
    callback_url: `${siteUrl}/api/webhooks/noramp`,
    checkout_id: checkoutId,
    idempotency_key: checkoutId,
    source: 'syngyn',
    compliance: norampRuoContext(),
    inline_blocks: true,
    disable_redirects: true,
  }

  const res = await fetch(`${norampBaseUrl()}/payment-intents`, {
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
    throw new Error(`[noramp] /payment-intents failed (${res.status}): ${text.slice(0, 500)}`)
  }

  const paymentIntentId = String(data.payment_intent_id || '')
  const clientSecret = String(data.client_secret || '')
  const publishableKey = String(data.publishable_key || '')
  const connectedAccountId = String(data.connected_account_id || '')
  if (!paymentIntentId || !clientSecret || !publishableKey) {
    throw new Error(`[noramp] /payment-intents response missing client fields: ${text.slice(0, 400)}`)
  }

  return { paymentIntentId, clientSecret, publishableKey, connectedAccountId }
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

// Missed-callback safety net → { payment_status }. Used by the success return
// + the expire-awaiting cron so a dropped/late callback can't strand a paid
// order as "awaiting payment" or get it wrongly abandoned. Never throws.
//
// orders.card_session_id holds EITHER a hosted-checkout session id (redirect
// experience) or a Stripe payment-intent id (inline experience — always
// `pi_…`), so the endpoint routes on that prefix, mirroring the plugin's
// intent-vs-session reconcile split. Callers don't care which it was.
async function norampReconcileSession({ sessionId, orderNumber, orderKey }) {
  const token = process.env.NORAMP_MERCHANT_TOKEN
  if (!token || !sessionId) return { paid: false, status: 'no_session' }

  const path = /^pi_/.test(String(sessionId))
    ? `/payment-intents/${encodeURIComponent(sessionId)}/reconcile`
    : `/checkout/sessions/${encodeURIComponent(sessionId)}/reconcile`

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''
  try {
    const res = await fetch(
      `${norampBaseUrl()}${path}`,
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
