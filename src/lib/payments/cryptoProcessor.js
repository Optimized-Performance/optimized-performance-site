import crypto from 'crypto'

const PROCESSOR = process.env.CRYPTO_PROCESSOR || 'nowpayments'

export function getCryptoProcessorName() {
  return PROCESSOR
}

export async function createCryptoCheckoutSession(opts) {
  if (PROCESSOR === 'nowpayments') return nowpaymentsCreateInvoice(opts)
  throw new Error(`[cryptoProcessor] Unsupported processor: ${PROCESSOR}`)
}

export async function parseCryptoWebhookEvent({ rawBody, headers }) {
  if (PROCESSOR === 'nowpayments') return nowpaymentsParseIpn({ rawBody, headers })
  throw new Error(`[cryptoProcessor] Unsupported processor: ${PROCESSOR}`)
}

const NOWPAYMENTS_API_BASE = 'https://api.nowpayments.io/v1'

async function nowpaymentsCreateInvoice({ orderNumber, amountCents, currency, returnUrl, cancelUrl, callbackUrl }) {
  const apiKey = process.env.NOWPAYMENTS_API_KEY
  if (!apiKey) {
    throw new Error('[nowpayments] NOWPAYMENTS_API_KEY not configured')
  }

  const body = {
    price_amount: Number((amountCents / 100).toFixed(2)),
    price_currency: (currency || 'USD').toLowerCase(),
    order_id: orderNumber,
    order_description: `Optimized Performance Inc. order ${orderNumber}`,
    ipn_callback_url: callbackUrl,
    success_url: returnUrl,
    cancel_url: cancelUrl,
    is_fee_paid_by_user: false,
  }

  const res = await fetch(`${NOWPAYMENTS_API_BASE}/invoice`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = null }

  if (!res.ok || !data) {
    throw new Error(`[nowpayments] invoice create failed (${res.status}): ${text.slice(0, 500)}`)
  }

  const redirectUrl = data.invoice_url
  if (!redirectUrl) {
    throw new Error(`[nowpayments] invoice response missing invoice_url. body=${text.slice(0, 400)}`)
  }
  return { redirectUrl, invoiceId: String(data.id || '') }
}

// NOWPayments IPN signs the payload with HMAC-SHA512 over a deterministic
// JSON string derived from the payload with keys sorted at every nesting
// level. Header: x-nowpayments-sig.
function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value && typeof value === 'object') {
    const out = {}
    for (const key of Object.keys(value).sort()) out[key] = sortKeysDeep(value[key])
    return out
  }
  return value
}

function nowpaymentsParseIpn({ rawBody, headers }) {
  const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET
  if (!ipnSecret) return { verified: false, reason: 'NOWPAYMENTS_IPN_SECRET not configured' }

  const received = headers['x-nowpayments-sig'] || headers['X-Nowpayments-Sig']
  if (!received) return { verified: false, reason: 'Missing x-nowpayments-sig header' }

  let payload
  try { payload = JSON.parse(rawBody) } catch { return { verified: false, reason: 'Invalid JSON body' } }

  const sorted = sortKeysDeep(payload)
  const expected = crypto.createHmac('sha512', ipnSecret).update(JSON.stringify(sorted)).digest('hex')

  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(String(received), 'hex')
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { verified: false, reason: 'Signature mismatch' }
  }

  const orderNumber = payload.order_id || ''
  const paymentId = String(payload.payment_id || '')
  const eventId = paymentId ? `${orderNumber}-${paymentId}` : `${orderNumber}-${String(received).slice(0, 16)}`

  const raw = String(payload.payment_status || '').toLowerCase()
  // 'finished' is the only confirmed-and-final state. 'partially_paid' means
  // the customer underpaid — surface as ignored so admin reviews manually.
  let status = 'pending'
  if (raw === 'finished') status = 'completed'
  else if (['failed', 'expired', 'refunded'].includes(raw)) status = 'failed'

  let ignore = false
  let ignoreReason
  if (raw === 'partially_paid') { ignore = true; ignoreReason = 'partially_paid — manual review' }

  return { verified: true, eventId, txId: paymentId, orderNumber, status, ignore, reason: ignoreReason }
}
