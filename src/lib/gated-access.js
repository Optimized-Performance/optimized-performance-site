import { supabaseAdmin } from './supabase'
import { getCustomerIdFromReq } from './customer-session'

// True if the request's logged-in customer's email is on the gated allowlist.
// Account-gated SKUs (visibility_tier='account_gated') are shown only to these
// requesters. BY EMAIL (not by account) so access can be pre-granted before the
// buyer registers and applies the moment they log in with that email.
//
// Two cheap reads (session -> customer email -> allowlist). Returns false for
// guests / unknown / not-allowlisted. Never throws — gating fails CLOSED.
export async function hasGatedAccess(req) {
  try {
    if (!supabaseAdmin) return false
    const customerId = getCustomerIdFromReq(req)
    if (!customerId) return false
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('email')
      .eq('id', customerId)
      .maybeSingle()
    const email = customer?.email?.trim().toLowerCase()
    if (!email) return false
    const { data: row } = await supabaseAdmin
      .from('gated_emails')
      .select('email')
      .eq('email', email)
      .maybeSingle()
    return !!row
  } catch {
    return false // fail closed — never expose gated SKUs on an error
  }
}
