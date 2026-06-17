import { selectPaypalAccount } from '../../../lib/payments/paypalAccounts'

// Server-authoritative weighted PayPal-account picker. The checkout Smart
// Buttons fetch this on mount to learn which account's (public) clientId to
// render with. Weights live in server env and are applied HERE so they never
// ship to the browser, and the account SECRET never leaves the server. The
// client sends the returned `key` back to /api/orders/create so the order is
// created + captured under the SAME account whose clientId rendered its buttons.
//
// no-store: every checkout load re-runs the weighted pick, so the split is
// honored per checkout session (the unit Smart Buttons can route at, since the
// SDK clientId is fixed once the buttons render).
export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  if (process.env.NEXT_PUBLIC_PAYPAL_ENABLED !== 'true') {
    return res.status(503).json({ error: 'PayPal is temporarily unavailable.' })
  }
  const account = selectPaypalAccount()
  if (!account.clientId) {
    return res.status(503).json({ error: 'PayPal account not configured.' })
  }
  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({ key: account.key, clientId: account.clientId })
}
