// Shared fulfillment helpers — package specs + address parsing used by both
// the legacy CSV export and the Shippo label purchase (lib/shippo).
// (No cold-pack import anymore — one flat package template regardless of cart.)

// Single flat package template (Matt, 2026-07-14): everything ships in one box
// declared at 1 lb — nothing goes over. Replaced the old kit-vs-vial split
// (stale Uline over-estimates). Env-overridable without a deploy so the box
// can be re-sized to match actual stock: SHIP_PARCEL_LBS / _OZ / _L / _W / _H.
//
// Default = Matt's actual mailer: 8×11 bubble mailer @ 1 lb, measured as
// 11 (L) × 8 (W) × 1 (packed thickness) ≈ 88 in³. UPS bills the GREATER of
// actual weight and DIMENSIONAL weight (L×W×H ÷ 139); at these dims the dim
// weight is ~0.6 lb, so UPS bills the flat 1 lb. Env-overridable without a
// deploy (SHIP_PARCEL_LBS/_OZ/_L/_W/_H) if the mailer ever changes.
const num = (v, d) => (Number(v) > 0 ? Number(v) : d)
export function packageSpecForOrder(/* items */) {
  return {
    lbs: num(process.env.SHIP_PARCEL_LBS, 1),
    oz: num(process.env.SHIP_PARCEL_OZ, 0),
    length: num(process.env.SHIP_PARCEL_L, 11),
    width: num(process.env.SHIP_PARCEL_W, 8),
    height: num(process.env.SHIP_PARCEL_H, 1),
  }
}

// Best-effort apartment/suite extraction from the single-line shipping
// address customers type at checkout. Carrier APIs want street1/street2. If
// we can't parse it, street2 stays blank and the whole string rides street1 —
// the carrier's address validator handles the rest.
export function splitStreetAndApt(addressLine) {
  if (!addressLine) return { street: '', apt: '' }
  const s = String(addressLine).trim()
  const aptPattern = /\b(apt|apartment|unit|suite|ste|#)\.?\s*[\w-]+/i
  const match = s.match(aptPattern)
  if (!match) return { street: s, apt: '' }
  const apt = match[0].trim()
  const street = s.replace(aptPattern, '').replace(/[,\s]+$/, '').trim()
  return { street, apt }
}
