// Recovery-incentive constants — SAFE FOR THE CLIENT BUNDLE (no node crypto).
//
// The payment-recovery nudge (1-hour abandoned-checkout email) carries an
// auto-apply "recover" link that grants an extra discount, stackable on top of
// whatever affiliate code the customer chooses. The token itself is signed +
// verified server-side in lib/recovery.js (node:crypto) — this file only holds
// the plain constants both the client (checkout.js) and server need, so importing
// it into client code never pulls crypto into the browser bundle.

// Extra % off, applied to the post-affiliate, pre-shipping subtotal — same tier
// as the crypto/Zelle alt-pay discount, stacks multiplicatively. Server is
// authoritative; the encoded token pct is capped to this value on verify so a
// tampered/forged token can never grant more.
export const RECOVERY_DISCOUNT_PCT = Number(process.env.NEXT_PUBLIC_RECOVERY_DISCOUNT_PCT) || 5;

// URL query param on the recovery link (?recover=<token>) and the JS-readable
// cookie that carries it from the landing page through to checkout (mirrors the
// opp_ref attribution-cookie pattern in lib/cohort-session.js).
export const RECOVERY_QUERY_PARAM = 'recover';
export const RECOVERY_COOKIE = 'opp_recover';
