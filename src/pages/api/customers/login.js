import { createCustomerToken, verifyPassword, customerSessionCookies } from '../../../lib/customer-session'
import { grantCohortCookies } from '../../../lib/cohort-session'
import { supabaseAdmin } from '../../../lib/supabase'
import { validateOrigin, rateLimit, validateEmail, escapeLike } from '../../../lib/security'

// POST /api/customers/login
//   Body: { email, password }
//   Success → sets HttpOnly session cookie, returns { ok, customer }
//   Failure → 401 generic; never reveal whether the email exists.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 10, windowMs: 60000 })) {
    return res.status(429).json({ error: 'Too many attempts' })
  }

  const { email, password } = req.body || {}
  if (!validateEmail(email) || typeof password !== 'string' || password.length === 0) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  const { data: customer, error } = await supabaseAdmin
    .from('customers')
    .select('id, email, name, password_hash')
    .ilike('email', escapeLike(email))
    .maybeSingle()

  // Always run a scrypt compare even when the customer is absent, to avoid a
  // timing oracle on email existence (same defense as the affiliate login).
  const storedHash = customer?.password_hash || 'scrypt$00000000000000000000000000000000$' + '0'.repeat(128)
  const passwordOk = verifyPassword(password, storedHash)

  if (error || !customer || !passwordOk) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }

  // Best-effort last-login stamp; never block login on it.
  supabaseAdmin
    .from('customers')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', customer.id)
    .then(() => {}, () => {})

  let token
  try {
    token = createCustomerToken(customer.id)
  } catch (e) {
    console.error('createCustomerToken failed:', e)
    return res.status(500).json({ error: 'Server error — session unavailable.' })
  }

  res.setHeader('Set-Cookie', customerSessionCookies(token))
  // Having an account unlocks the cohort gate (see lib/cohort-session) — set
  // the cookies here so the very next page render shows the full catalog.
  grantCohortCookies(res)
  return res.status(200).json({ ok: true, customer: { id: customer.id, email: customer.email, name: customer.name } })
}
