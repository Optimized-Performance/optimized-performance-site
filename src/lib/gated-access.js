import { supabaseAdmin } from './supabase'
import { getCustomerIdFromReq } from './customer-session'

// Is this request an approved researcher (may purchase gated SKUs + see
// account_gated SKUs)?
//
// DEFAULT (instant-approval posture, 2026-07-23): ANY authenticated customer is
// approved. The entry login wall (components/AgeGate) already requires account
// creation + research-use attestation to get in, and signup auto-approves — so
// "has an account" == "approved researcher." This also covers accounts made
// OUTSIDE the application flow (the /account/login Register tab, the
// grandfathered-guest set-password self-heal, and anyone who registered during
// the brief manual-review window before instant approval) — they were logged in
// but not on gated_emails, so the old email-allowlist check locked them out.
//
// MANUAL-REVIEW mode (NEXT_PUBLIC_RESEARCH_ACCESS_MANUAL_REVIEW=true): falls back
// to the genuine gated_emails allowlist, so the kill-switch still restores real
// pre-approval gating. NEXT_PUBLIC vars are readable server-side too.
//
// Never throws — gating fails CLOSED (guests always false).
export async function hasGatedAccess(req) {
  try {
    if (!supabaseAdmin) return false
    const customerId = getCustomerIdFromReq(req)
    if (!customerId) return false

    // Confirm the session resolves to a real customer row (guards a stale /
    // rotated session pointing at a deleted account).
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('id, email')
      .eq('id', customerId)
      .maybeSingle()
    if (!customer) return false

    // Default: any authenticated customer is approved.
    if (process.env.NEXT_PUBLIC_RESEARCH_ACCESS_MANUAL_REVIEW !== 'true') return true

    // Manual-review mode: require the email on the gated_emails allowlist.
    const email = customer.email?.trim().toLowerCase()
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
