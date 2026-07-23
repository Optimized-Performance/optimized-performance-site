import { clearCustomerSessionCookies } from '../../../lib/customer-session'
import { validateOrigin } from '../../../lib/security'

// POST /api/customers/logout — clears the session cookie.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  res.setHeader('Set-Cookie', clearCustomerSessionCookies())
  return res.status(200).json({ ok: true })
}
