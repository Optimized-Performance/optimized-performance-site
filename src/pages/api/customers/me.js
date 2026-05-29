import { getCustomerIdFromReq } from '../../../lib/customer-session'
import { supabaseAdmin } from '../../../lib/supabase'

// GET /api/customers/me — returns { customer } for the current session, or 401.
// Used by the checkout page to decide sign-in-gate vs. the order form when
// NEXT_PUBLIC_REQUIRE_ACCOUNT is on.
export default async function handler(req, res) {
  const customerId = getCustomerIdFromReq(req)
  if (!customerId) return res.status(401).json({ error: 'Not authenticated' })
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  const { data: customer } = await supabaseAdmin
    .from('customers')
    .select('id, email, name')
    .eq('id', customerId)
    .maybeSingle()

  if (!customer) return res.status(401).json({ error: 'Not authenticated' })
  return res.status(200).json({ customer })
}
