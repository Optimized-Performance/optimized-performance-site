// Single source of truth for the BASIS of affiliate earnings.
//
// Affiliates earn on product revenue only. Shipping is a logistics
// pass-through (collected from the customer, paid to the carrier) and is NOT
// commissionable — so every affiliate dollar (direct commission, the monthly
// recruiter override, and the flat-rate royalty) is computed on the
// post-all-discount order total MINUS shipping.
//
// Volume / "revenue driven" stats intentionally still report gross sales
// (what the customer actually paid); only EARNINGS exclude shipping. That
// mirrors the standard affiliate model — commission on product revenue, not
// postage.
//
// Import this everywhere an affiliate payout dollar is computed so the rule
// can't drift: lib/payments/finalizeOrder, admin OrdersTab, affiliate
// dashboard (api/affiliates/me), api/affiliates/payouts, and
// api/cron/affiliate-monthly.

// The commissionable basis for one order: post-all-discount total less shipping.
export function commissionableTotal(order) {
  const total = Number(order?.total || 0)
  const shipping = Number(order?.shipping || 0)
  return Math.max(0, total - shipping)
}

// Direct commission for one order, using the per-order rate snapshot
// (affiliate_commission_pct, captured at order-create time). Rounded to cents.
export function calcCommission(order) {
  const pct = Number(order?.affiliate_commission_pct || 0)
  return Math.round(commissionableTotal(order) * pct) / 100
}
