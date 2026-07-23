import { verifyResetToken, peekCustomerId } from '../../../lib/customer-tokens'
import { hashPassword, createCustomerToken, customerSessionCookies } from '../../../lib/customer-session'
import { supabaseAdmin } from '../../../lib/supabase'
import { validateOrigin, rateLimit } from '../../../lib/security'

// POST /api/customers/reset-password  Body: { token, password }
// Token is bound to the CURRENT password_hash (see lib/customer-tokens), so
// it dies the moment this succeeds — effective single-use. On success the
// customer is signed in (cookie set) so the reset lands them in /account.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 10, windowMs: 60000 })) {
    return res.status(429).json({ error: 'Too many attempts.' })
  }

  const { token, password } = req.body || {}
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' })
  }
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  // Untrusted peek → fetch the row → full verification against its hash.
  const customerId = peekCustomerId(token)
  if (!customerId) return res.status(400).json({ error: 'This reset link is invalid or expired.' })

  const { data: customer } = await supabaseAdmin
    .from('customers')
    .select('id, email, password_hash')
    .eq('id', customerId)
    .maybeSingle()
  if (!customer) return res.status(400).json({ error: 'This reset link is invalid or expired.' })

  const { valid } = verifyResetToken(token, customer.password_hash)
  if (!valid) return res.status(400).json({ error: 'This reset link is invalid or expired — request a new one.' })

  let passwordHash
  try {
    passwordHash = hashPassword(password)
  } catch {
    return res.status(500).json({ error: 'Server error.' })
  }

  const { error } = await supabaseAdmin
    .from('customers')
    .update({ password_hash: passwordHash })
    .eq('id', customer.id)
  if (error) {
    console.error('[customers/reset-password] update failed:', error)
    return res.status(500).json({ error: 'Could not update password.' })
  }

  // Receiving the reset email proves inbox control — same proof the verify
  // link relies on — so a successful reset also marks the email verified.
  await supabaseAdmin
    .from('customers')
    .update({ email_verified: true, verified_at: new Date().toISOString() })
    .eq('id', customer.id)
    .eq('email_verified', false)

  let sessionToken
  try {
    sessionToken = createCustomerToken(customer.id)
  } catch (e) {
    console.error('[customers/reset-password] session mint failed:', e)
    return res.status(200).json({ ok: true, signedIn: false })
  }
  res.setHeader('Set-Cookie', customerSessionCookies(sessionToken))
  return res.status(200).json({ ok: true, signedIn: true })
}
