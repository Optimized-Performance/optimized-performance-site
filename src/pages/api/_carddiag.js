// TEMPORARY go-live diagnostic — DELETE after use. Calls the live card
// processor's createCheckoutSession with a dummy $1 order (no DB write, no
// charge — just a Stripe API round-trip) and returns the sanitized result so
// we can see the EXACT reason card checkout is failing. Gated on a one-shot
// token so it isn't publicly triggerable.
import { createCheckoutSession } from '../../lib/payments/cardProcessor'

const DIAG_TOKEN = 'sg-carddiag-7f3a91'

// Strip anything that looks like a Stripe key so the response never echoes a secret.
function sanitize(s) {
  return String(s || '').replace(/(?:sk|rk|pk|whsec)_[A-Za-z0-9_]+/g, '[redacted]')
}

export default async function handler(req, res) {
  if (req.query.k !== DIAG_TOKEN) return res.status(404).end()
  const present = {
    CARD_PROCESSOR: process.env.CARD_PROCESSOR || '(unset)',
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY
      ? `set (${String(process.env.STRIPE_SECRET_KEY).slice(0, 7)}…, len ${process.env.STRIPE_SECRET_KEY.length})`
      : '(unset)',
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ? 'set' : '(unset)',
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || '(unset)',
  }
  try {
    const r = await createCheckoutSession({
      orderNumber: 'DIAG-TEST',
      amountCents: 100,
      currency: 'USD',
      customer: { name: 'Diag Test', email: 'diag@syngyn.co', address: '1 Test St', city: 'Carmel', state: 'CA', zip: '93923', country: 'US' },
      returnUrl: 'https://syngyn.co/checkout/success?order=DIAG-TEST',
      cancelUrl: 'https://syngyn.co/checkout/cancel',
    })
    return res.status(200).json({ ok: true, present, gotRedirect: !!r.redirectUrl, sessionIdPrefix: String(r.sessionId || '').slice(0, 3) })
  } catch (err) {
    return res.status(200).json({ ok: false, present, error: sanitize(err.message), type: err.type || err.name || null, code: sanitize(err.code) })
  }
}
