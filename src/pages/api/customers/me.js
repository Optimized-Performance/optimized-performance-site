import { getCustomerIdFromReq } from '../../../lib/customer-session'
import { supabaseAdmin } from '../../../lib/supabase'

// GET /api/customers/me — returns { customer } for the current session, or 401.
// Used by the checkout page to decide sign-in-gate vs. the order form when
// NEXT_PUBLIC_REQUIRE_ACCOUNT is on.
export default async function handler(req, res) {
  const customerId = getCustomerIdFromReq(req)
  if (!customerId) return res.status(401).json({ error: 'Not authenticated' })
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  // email_verified arrives with migration v27 — fall back to the v21 column
  // set if the deploy lands before the migration runs, because this endpoint
  // backs the checkout account gate and must never 500 on a missing column.
  let { data: customer, error } = await supabaseAdmin
    .from('customers')
    .select('id, email, name, email_verified, created_at')
    .eq('id', customerId)
    .maybeSingle()
  if (error) {
    const fallback = await supabaseAdmin
      .from('customers')
      .select('id, email, name, created_at')
      .eq('id', customerId)
      .maybeSingle()
    customer = fallback.data ? { ...fallback.data, email_verified: false } : null
  }

  if (!customer) return res.status(401).json({ error: 'Not authenticated' })
  return res.status(200).json({ customer })
}
