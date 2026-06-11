import { verifyVerifyToken } from '../../../lib/customer-tokens'
import { supabaseAdmin } from '../../../lib/supabase'

// GET /api/customers/verify-email?token=...
// Landing endpoint for the verification link in the registration email.
// Marks the customer verified and bounces to /account. GET-with-redirect is
// the standard shape for email links; an email-scanner prefetch "clicking"
// it is harmless (it can only verify the address the email was sent to).
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const { token } = req.query
  const { valid, customerId } = verifyVerifyToken(token)
  if (!valid || !supabaseAdmin) {
    res.setHeader('Location', '/account?verify_error=1')
    return res.status(302).end()
  }

  const { error } = await supabaseAdmin
    .from('customers')
    .update({ email_verified: true, verified_at: new Date().toISOString() })
    .eq('id', customerId)

  if (error) {
    console.error('[customers/verify-email] update failed:', error)
    res.setHeader('Location', '/account?verify_error=1')
    return res.status(302).end()
  }

  res.setHeader('Location', '/account?verified=1')
  return res.status(302).end()
}
