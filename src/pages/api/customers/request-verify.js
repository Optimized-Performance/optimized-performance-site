import { getCustomerIdFromReq } from '../../../lib/customer-session'
import { signVerifyToken } from '../../../lib/customer-tokens'
import { sendVerificationEmail } from '../../../lib/customer-emails'
import { supabaseAdmin } from '../../../lib/supabase'
import { validateOrigin, rateLimit } from '../../../lib/security'

// POST /api/customers/request-verify — resend the verification email for the
// signed-in customer. Session-gated, so it can only ever email the account's
// own address.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 3, windowMs: 60000 })) {
    return res.status(429).json({ error: 'Too many requests — check your inbox for the earlier email.' })
  }

  const customerId = getCustomerIdFromReq(req)
  if (!customerId) return res.status(401).json({ error: 'Not authenticated' })
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  const { data: customer } = await supabaseAdmin
    .from('customers')
    .select('id, email, email_verified')
    .eq('id', customerId)
    .maybeSingle()
  if (!customer) return res.status(401).json({ error: 'Not authenticated' })
  if (customer.email_verified) return res.status(200).json({ ok: true, already: true })

  const token = signVerifyToken(customer.id)
  if (!token) return res.status(500).json({ error: 'Server error.' })

  const sent = await sendVerificationEmail(customer, token)
  if (!sent) return res.status(500).json({ error: 'Could not send the email — try again shortly.' })
  return res.status(200).json({ ok: true })
}
