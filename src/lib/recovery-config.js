// Recovery-incentive constants — SAFE FOR THE CLIENT BUNDLE (no node crypto).
//
// The payment-recovery nudge (1-hour abandoned-checkout email) and the
// replenishment reorder nudge both carry an auto-apply "recover" link. A valid
// link marks a HOUSE ORDER — a reorder / abandoned-cart sale we recaptured via
// our OWN email — which grants this discount and carries NO affiliate commission
// (the affiliate_code is stripped server-side in api/orders/create.js). The
// customer gets the better of this % or their affiliate code; we don't pay a
// commission on a sale our retention email drove. Affiliate links / new traffic
// are untouched. The token is signed + verified server-side in lib/recovery.js
// (node:crypto); this file only holds the plain constants both the client
// (checkout.js) and server need, so importing it client-side never pulls crypto
// into the browser bundle.

// House-order % off, applied pre-shipping. The customer gets max(this, affiliate
// %) as their discount but the order pays no affiliate commission. Server is
// authoritative; pct is server-fixed in lib/recovery (never read from the token)
// so a tampered/forged link can never escalate it. (15% = the standard ~10%
// affiliate-customer discount + an extra 5%, set 2026-06-08.)
export const RECOVERY_DISCOUNT_PCT = Number(process.env.NEXT_PUBLIC_RECOVERY_DISCOUNT_PCT) || 15;

// URL query param on the recovery link (?recover=<token>) and the JS-readable
// cookie that carries it from the landing page through to checkout (mirrors the
// opp_ref attribution-cookie pattern in lib/cohort-session.js).
export const RECOVERY_QUERY_PARAM = 'recover';
export const RECOVERY_COOKIE = 'opp_recover';
