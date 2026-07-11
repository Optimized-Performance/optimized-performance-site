// Single source of truth for the BASIS of affiliate earnings.
//
// Affiliates earn on product MARGIN: the post-all-discount order total MINUS
// shipping MINUS the order's COGS snapshot. Shipping is a logistics
// pass-through (collected from the customer, paid to the carrier); COGS is the
// estimated vendor cost of the items, stamped on the order at create time
// (orders.cogs, migration v33) from the PRODUCT_COST map in lib/takehome-config
// — per Tris's instruction (2026-07 review), commission accounts for cost of
// goods. Every affiliate dollar (direct commission, the monthly recruiter
// override, and the flat-rate royalty) is computed on this basis.
//
// Orders created BEFORE the v33 cutover have cogs NULL → treated as 0 → their
// basis stays the legacy total-minus-shipping. Earnings already shown or paid
// never shift retroactively.
//
// Volume / "revenue driven" stats intentionally still report gross sales
// (what the customer actually paid); only EARNINGS exclude shipping + COGS.
//
// Import this everywhere an affiliate payout dollar is computed so the rule
// can't drift: lib/payments/finalizeOrder, admin OrdersTab, affiliate
// dashboard (api/affiliates/me), api/affiliates/payouts, api/affiliates/network,
// api/admin/royalty, and api/cron/affiliate-monthly. Callers that select
// explicit columns must include `cogs`.

// The commissionable basis for one order: post-all-discount total less
// shipping and the order's COGS snapshot (NULL/absent on pre-v33 orders → 0).
export function commissionableTotal(order) {
  const total = Number(order?.total || 0)
  const shipping = Number(order?.shipping || 0)
  const cogs = Number(order?.cogs || 0)
  return Math.max(0, total - shipping - cogs)
}

// Direct commission for one order, using the per-order rate snapshot
// (affiliate_commission_pct, captured at order-create time). Rounded to cents.
export function calcCommission(order) {
  const pct = Number(order?.affiliate_commission_pct || 0)
  return Math.round(commissionableTotal(order) * pct) / 100
}
