import { describe, it, expect } from 'vitest'
import { commissionableTotal, calcCommission } from './commission.js'
import { tierLookup, decideTier } from './affiliate-config.js'

describe('commissionableTotal', () => {
  it('subtracts shipping and the COGS snapshot from the post-discount total', () => {
    expect(commissionableTotal({ total: 116.95, shipping: 16.95, cogs: 5.4 })).toBeCloseTo(94.6, 2)
  })

  it('pre-v33 order (cogs null/absent) keeps the legacy total-minus-shipping basis', () => {
    expect(commissionableTotal({ total: 116.95, shipping: 16.95, cogs: null })).toBeCloseTo(100, 2)
    expect(commissionableTotal({ total: 116.95, shipping: 16.95 })).toBeCloseTo(100, 2)
  })

  it('never goes negative', () => {
    expect(commissionableTotal({ total: 10, shipping: 8, cogs: 5 })).toBe(0)
  })
})

describe('calcCommission', () => {
  it('applies the per-order rate snapshot to the COGS-adjusted basis', () => {
    // 40% of (116.95 - 16.95 - 5.40) = 37.84
    expect(calcCommission({ total: 116.95, shipping: 16.95, cogs: 5.4, affiliate_commission_pct: 40 })).toBeCloseTo(37.84, 2)
  })

  it('unattributed order (no pct snapshot) earns nothing', () => {
    expect(calcCommission({ total: 100, shipping: 0, cogs: 10 })).toBe(0)
  })
})

describe('tierLookup', () => {
  it('maps volume to the standard tier rates', () => {
    expect(tierLookup(0)).toBe(10)
    expect(tierLookup(9999)).toBe(10)
    expect(tierLookup(10000)).toBe(15)
    expect(tierLookup(20000)).toBe(20)
    expect(tierLookup(35000)).toBe(25)
    expect(tierLookup(60000)).toBe(30)
    expect(tierLookup(1e9)).toBe(30)
  })
})

// Two-consecutive-month ratchet: a move in either direction needs both of the
// last two months to qualify; a mixed read holds the current rate.
describe('decideTier', () => {
  it('promotes when both months earned above the current rate', () => {
    expect(decideTier({ current: 10, earnedPrev: 15, earnedLast: 15 })).toBe(15)
  })

  it('promotion lands on the highest tier BOTH months support', () => {
    expect(decideTier({ current: 10, earnedPrev: 20, earnedLast: 15 })).toBe(15)
    expect(decideTier({ current: 10, earnedPrev: 30, earnedLast: 30 })).toBe(30)
  })

  it('holds on one hot month', () => {
    expect(decideTier({ current: 10, earnedPrev: 10, earnedLast: 30 })).toBe(10)
    expect(decideTier({ current: 10, earnedPrev: 30, earnedLast: 10 })).toBe(10)
  })

  it('demotes only after two months below the current rate', () => {
    expect(decideTier({ current: 20, earnedPrev: 10, earnedLast: 10 })).toBe(10)
  })

  it('holds on one cold month', () => {
    expect(decideTier({ current: 20, earnedPrev: 10, earnedLast: 20 })).toBe(20)
    expect(decideTier({ current: 20, earnedPrev: 25, earnedLast: 10 })).toBe(20)
  })

  it('demotion lands on the best tier either month earned', () => {
    expect(decideTier({ current: 30, earnedPrev: 10, earnedLast: 20 })).toBe(20)
  })

  it('holds a seeded off-tier rate unless both months disagree with it', () => {
    // seeded at 22 (between tiers): mixed read holds
    expect(decideTier({ current: 22, earnedPrev: 20, earnedLast: 25 })).toBe(22)
    // both months below → demote to the best earned
    expect(decideTier({ current: 22, earnedPrev: 20, earnedLast: 15 })).toBe(20)
    // both months above → promote to what both support
    expect(decideTier({ current: 22, earnedPrev: 25, earnedLast: 30 })).toBe(25)
  })

  it('holds at the exact tier rate (equal months are not a move)', () => {
    expect(decideTier({ current: 15, earnedPrev: 15, earnedLast: 15 })).toBe(15)
  })
})
