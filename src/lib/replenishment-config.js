// Per-product reorder-cycle lengths (days) for the "running low?" nudge.
//
// The nudge fires when a customer's last purchase of a product is ~this many
// days old (within a grace window). Tune per product as you learn real reorder
// cadence — most peptide vials/kits run roughly a month. Keyed by product id
// (orders.items[].id). Anything not listed uses DEFAULT_CYCLE_DAYS.
//
// Set a product's value to 0 (or omit + lower DEFAULT) to exclude it; consumables
// like BAC water reorder on their own cadence and aren't worth nudging.

export const DEFAULT_CYCLE_DAYS = 30

// Examples — adjust ids/values to the catalog. Left mostly empty on purpose so
// the default governs until you have real cadence data (instrumentation build).
export const CYCLE_DAYS_BY_PRODUCT = {
  // 'hgh-191aa-10iu': 30,
  // 'glp-3-10mg': 30,
  // 'mots-c': 30,
  // 'bac-water-10ml': 0,   // exclude — not a nudge-worthy reorder
}

// How long after the cycle elapses we'll still send a "running low?" nudge.
// Inside [cycle, cycle+grace] = due now; beyond that the customer has lapsed
// (a win-back campaign's job, not replenishment) so we don't nag stale buyers.
export const GRACE_DAYS = 14

export function cycleDaysFor(productId) {
  const v = CYCLE_DAYS_BY_PRODUCT[productId]
  return typeof v === 'number' ? v : DEFAULT_CYCLE_DAYS
}
