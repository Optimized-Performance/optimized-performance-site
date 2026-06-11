import { signResetToken } from '../../../lib/customer-tokens'
import { sendPasswordResetEmail } from '../../../lib/customer-emails'
import { supabaseAdmin } from '../../../lib/supabase'
import { validateOrigin, rateLimit, validateEmail } from '../../../lib/security'

// POST /api/customers/request-reset  Body: { email }
// ALWAYS returns 200 with the same body — whether or not the email has an
// account — so it can't be used to enumerate which emails are registered.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 5, windowMs: 60000 })) {
    return res.status(429).json({ error: 'Too many requests. Try again in a minute.' })
  }

  const { email } = req.body || {}
  if (!validateEmail(email)) return res.status(400).json({ error: 'A valid email is required.' })
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  const ok = { ok: true, message: 'If that email has an account, a reset link is on its way.' }

  const { data: customer } = await supabaseAdmin
    .from('customers')
    .select('id, email, password_hash')
    .ilike('email', email.trim())
    .maybeSingle()

  // Unknown email → identical response, no send.
  if (!customer) return res.status(200).json(ok)

  const token = signResetToken(customer.id, customer.password_hash)
  if (token) {
    // Fire-and-forget keeps response timing identical for known vs unknown
    // emails (a timing oracle would otherwise leak which emails exist).
    sendPasswordResetEmail(customer, token).catch((err) =>
      console.error('[customers/request-reset] send failed:', err)
    )
  }
  return res.status(200).json(ok)
}
