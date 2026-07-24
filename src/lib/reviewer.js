import { getCustomerIdFromReq } from './customer-session'
import { supabaseAdmin } from './supabase'

// Reviewer / underwriter demo accounts (2026-07-23). A bank/processor underwriter
// asked for a login to see the site "as it appears and functions when logged in."
// Since any logged-in customer is now approved and sees the full 34-SKU catalog
// (incl. the 8 account_gated SKUs), a plain account would show them the whole
// line. A reviewer account is scoped to PUBLIC SKUs only — exactly the catalog
// routed through that rail — while still being approved to TRANSACT them (so the
// underwriter can see the real checkout flow). It never sees account_gated SKUs
// on /shop, the home grid, or a direct product URL (those fall back to the
// generic private-inquiry page, same as a guest).
//
// Membership = the logged-in customer's email in REVIEWER_EMAILS (env,
// comma-separated) OR the hardcoded default. Reviewer accounts have LESS access
// than a normal account, so an extra entry here is never a privilege risk.
const DEFAULT_REVIEWERS = ['underwriting@syngyn.co']

function reviewerEmailSet() {
  const env = (process.env.REVIEWER_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return new Set([...DEFAULT_REVIEWERS, ...env])
}

// True if the request's logged-in customer is a reviewer/underwriter account.
// One cheap read (session -> email). Never throws; false for guests.
export async function isReviewer(req) {
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
    return !!email && reviewerEmailSet().has(email)
  } catch {
    return false
  }
}
