import crypto from 'crypto'

const PROCESSOR = process.env.CARD_PROCESSOR || 'bankful'

export async function createCheckoutSession(opts) {
  if (PROCESSOR === 'bankful') return bankfulCreateSession(opts)
  if (PROCESSOR === 'noramp') return norampCreateSession(opts)
  throw new Error(`[cardProcessor] Unsupported processor: ${PROCESSOR}`)
}

export async function parseWebhookEvent({ rawBody, headers }) {
  if (PROCESSOR === 'bankful') return bankfulParseWebhook({ rawBody, headers })
  if (PROCESSOR === 'noramp') return norampParseWebhook({ rawBody, headers })
  throw new Error(`[cardProcessor] Unsupported processor: ${PROCESSOR}`)
}

const BANKFUL_LIVE_BASE = 'https://api.paybybankful.com'

function bankfulBaseUrl() {
  return process.env.BANKFUL_API_BASE || BANKFUL_LIVE_BASE
}

// HMAC-SHA256 over sorted-key concatenation of (key + value), excluding the
// signature field (either case — outbound uses `signature`, inbound `SIGNATURE`)
// and any empty/null/undefined values. Salt is the API Secret.
function signBankfulPayload(payload, secret) {
  const keys = Object.keys(payload)
    .filter((k) => k.toLowerCase() !== 'signature')
    .filter((k) => payload[k] !== undefined && payload[k] !== null && payload[k] !== '')
    .sort()
  const payloadString = keys.map((k) => `${k}${payload[k]}`).join('')
  return crypto.createHmac('sha256', secret).update(payloadString).digest('hex')
}

async function bankfulCreateSession({ orderNumber, amountCents, currency, customer, returnUrl, cancelUrl, callbackUrl }) {
  const reqUsername = process.env.BANKFUL_API_KEY
  const apiPassword = process.env.BANKFUL_API_SECRET
  if (!reqUsername || !apiPassword) {
    throw new Error('[bankful] BANKFUL_API_KEY / BANKFUL_API_SECRET not configured')
  }

  const payload = {
    req_username: reqUsername,
    transaction_type: 'CAPTURE',
    amount: (amountCents / 100).toFixed(2),
    request_currency: currency || 'USD',
    xtl_order_id: orderNumber,
    cart_name: 'Hosted-Page',
    url_complete: returnUrl,
    url_cancel: cancelUrl,
    url_failed: cancelUrl,
    url_pending: returnUrl,
    url_callback: callbackUrl,
    return_redirect_url: 'Y',
  }

  if (customer.email) payload.cust_email = customer.email
  if (customer.firstName) payload.cust_fname = customer.firstName
  if (customer.lastName) payload.cust_lname = customer.lastName
  if (customer.phone) payload.cust_phone = customer.phone
  if (customer.address) payload.bill_addr = customer.address
  if (customer.city) payload.bill_addr_city = customer.city
  if (customer.state) payload.bill_addr_state = customer.state
  if (customer.zip) payload.bill_addr_zip = customer.zip
  if (customer.country) payload.bill_addr_country = customer.country

  const signature = signBankfulPayload(payload, apiPassword)

  const res = await fetch(`${bankfulBaseUrl()}/front-calls/go-in/hosted-page-pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, signature }),
  })

  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = null }

  if (!res.ok || !data) {
    throw new Error(`[bankful] HPP create-session failed (${res.status}): ${text.slice(0, 500)}`)
  }

  const redirectUrl = data.redirect_url
  if (!redirectUrl) {
    throw new Error(`[bankful] HPP no redirect_url. status=${data.status} errorMessage=${data.errorMessage} body=${text.slice(0, 400)}`)
  }
  return { redirectUrl }
}

async function bankfulParseWebhook({ rawBody, headers }) {
  const apiPassword = process.env.BANKFUL_API_SECRET
  if (!apiPassword) return { verified: false, reason: 'BANKFUL_API_SECRET not configured' }

  const params = new URLSearchParams(rawBody)
  const data = {}
  for (const [k, v] of params) data[k] = v

  const receivedSignature = data.SIGNATURE || data.signature
  if (!receivedSignature) return { verified: false, reason: 'Missing signature in callback' }

  const expected = Buffer.from(signBankfulPayload(data, apiPassword).toLowerCase())
  const received = Buffer.from(String(receivedSignature).toLowerCase())
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    return { verified: false, reason: 'Signature mismatch' }
  }

  const orderNumber = data.XTL_ORDER_ID || data.xtl_order_id
  const txId =
    data.TRANS_REQUEST_ID || data.trans_request_id ||
    data.TRANS_ORDER_ID || data.trans_order_id ||
    data.TRANS_RECORD_ID || data.trans_record_id || ''
  const eventId = txId ? `${orderNumber}-${txId}` : `${orderNumber}-${String(receivedSignature).slice(0, 16)}`

  const rawStatus = String(data.TRANS_STATUS_NAME || data.trans_status_name || data.STATUS || data.status || '').toUpperCase()
  let status = 'pending'
  if (['APPROVED', 'COMPLETED', 'SUCCESS', 'PAID'].includes(rawStatus)) status = 'completed'
  else if (['DECLINED', 'FAILED', 'ERROR', 'CANCELED', 'CANCELLED'].includes(rawStatus)) status = 'failed'

  return { verified: true, eventId, txId, orderNumber, status }
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
  const order = {
    id: String(orderNumber),
    number: String(orderNumber),
    key: String(orderNumber),
    currency: (currency || 'USD').toLowerCase(),
    total: (amountCents / 100).toFixed(2),
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
  return { redirectUrl }
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
