// Shipping cost calculation. Single source of truth for both the server-side
// /api/orders/create handler and the client-side checkout + cart drawer.
//
// Pricing rule (carried forward 2026-05-11 from Option B's 2026-05-06 finalization
// after cold-chain packaging pivoted from Uline insulated boxes + PCM gel to
// thermal-insulated mailers — kept unchanged at launch for margin headroom
// while we ramp; planned to reintroduce insulated-box shippers post-launch
// once volume supports the higher COGS):
//   - Vial-only base: $16.95 — ships USPS Ground Advantage in a thermal-
//     insulated mailer. Lyophilized peptide stability at room temp for short
//     periods + the mailer's reflective insulation through 2-5 day Ground
//     transit keeps vials within an acceptable handling envelope nationwide.
//   - Cold-pack surcharge: +$17 when cart contains any kit SKU. Kits ship
//     USPS Priority Mail (1-3 day transit) in a larger thermal-insulated
//     mailer. Surcharge covers the larger mailer + faster carrier service
//     the higher kit volume warrants. Total kit shipping = $33.95.
//   - Free standard shipping over $250 (post-discount) — vial-only carts
//     ONLY. Carts containing any kit always pay the cold-pack surcharge,
//     regardless of subtotal.

export const SHIPPING_BASE = 16.95
export const COLD_PACK_SURCHARGE = 17
export const FREE_SHIPPING_THRESHOLD = 250

export function cartRequiresColdPack(items) {
  if (!Array.isArray(items)) return false
  return items.some((it) => it && it.isKit === true)
}

export function calcShipping({ items, discountedSubtotal, saleActive = false }) {
  const coldPack = cartRequiresColdPack(items)
  // Memorial Day (and any future) site-wide sale: free shipping overrides
  // normal calc including cold-pack surcharge. Cold-chain is still used for
  // kits — we just absorb the cost during the sale window.
  if (saleActive) {
    return { base: 0, coldPack: 0, total: 0, hasColdPack: coldPack, freeShipApplied: true, saleApplied: true }
  }
  if (!coldPack && discountedSubtotal >= FREE_SHIPPING_THRESHOLD) {
    return { base: 0, coldPack: 0, total: 0, hasColdPack: false, freeShipApplied: true, saleApplied: false }
  }
  return {
    base: SHIPPING_BASE,
    coldPack: coldPack ? COLD_PACK_SURCHARGE : 0,
    total: SHIPPING_BASE + (coldPack ? COLD_PACK_SURCHARGE : 0),
    hasColdPack: coldPack,
    freeShipApplied: false,
    saleApplied: false,
  }
}
