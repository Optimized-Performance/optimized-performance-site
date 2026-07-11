// Shared affiliate-program constants + tier math. Single source of truth so
// the monthly cron (which PAYS royalties / moves rates) and the affiliate
// dashboard (which PROJECTS them) can't drift apart.

// Flat-rate primary affiliates earn a royalty of this % of OPP's total gross
// revenue (all sales, all channels), paid monthly by api/cron/affiliate-monthly.
export const ROYALTY_PCT = 5

// Commission tiers on prior-month attributed volume (commissionable basis —
// see lib/commission). Rates are the STANDARD tier rates; recruited affiliates
// store (tier − recruiter override).
export const TIER_THRESHOLDS = [
  { min: 0,      max: 9999,    rate: 10 },
  { min: 10000,  max: 19999,   rate: 15 },
  { min: 20000,  max: 34999,   rate: 20 },
  { min: 35000,  max: 59999,   rate: 25 },
  { min: 60000,  max: Infinity, rate: 30 },
]

export function tierLookup(volume) {
  const v = Number(volume) || 0
  return TIER_THRESHOLDS.find((t) => v >= t.min && v <= t.max).rate
}

// Two-consecutive-month ratchet rule (2026-07 review): a rate move in EITHER
// direction requires two months in a row of qualifying volume — one hot or
// one cold month holds the current rate.
//   - promote when BOTH months earned above the current rate → land on the
//     highest tier both months support (min of the two earned tiers)
//   - demote when BOTH months earned below the current rate → land on the
//     best tier either month earned (max of the two)
//   - mixed months → hold
// All three inputs are TIER-plane rates: for recruited affiliates, add the
// recruiter override back onto the stored pct before calling this, and
// subtract it again from the result.
export function decideTier({ current, earnedPrev, earnedLast }) {
  const c = Number(current) || 0
  if (earnedPrev > c && earnedLast > c) return Math.min(earnedPrev, earnedLast)
  if (earnedPrev < c && earnedLast < c) return Math.max(earnedPrev, earnedLast)
  return c
}
