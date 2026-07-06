import { describe, it, expect } from 'vitest'
import { computeOrderTotals, isAltPayMethod } from './pricing.js'
import { volumeTierPct, calcVolumeDiscount } from './sale.js'

// Dates chosen relative to the promo windows defined in lib/sale.js:
//   Memorial Day: 2026-05-23 07:00 UTC .. 2026-05-26 06:59:59 UTC
//   GLP-3 BOGO:   2026-05-29 07:00 UTC .. 2026-06-06 06:59:59 UTC
const NO_PROMO = new Date('2026-06-10T12:00:00Z') // after both windows
const IN_MEMORIAL = new Date('2026-05-24T12:00:00Z')
const IN_BOGO = new Date('2026-06-01T12:00:00Z')

const money = (v) => expect.closeTo(v, 2)

describe('computeOrderTotals', () => {
  it('plain cart, card rail, vial-only under free-ship threshold', () => {
    const r = computeOrderTotals({
      lineItems: [{ id: 'x', price: 100, quantity: 1, isKit: false }],
      paymentMethod: 'paypal',
      now: NO_PROMO,
    })
    expect(r.subtotal).toEqual(money(100))
    expect(r.shipping.total).toEqual(money(16.95))
    expect(r.standardTotal).toEqual(money(116.95))
    expect(r.altPayDiscount).toEqual(money(5)) // 5% of 100
    expect(r.altPayTotal).toEqual(money(111.95)) // 116.95 - 5
    expect(r.total).toEqual(money(116.95)) // non-alt rail pays standard
  })

  it('alt-pay rail (crypto) charges the alt-pay total', () => {
    const r = computeOrderTotals({
      lineItems: [{ id: 'x', price: 100, quantity: 1 }],
      paymentMethod: 'crypto',
      now: NO_PROMO,
    })
    expect(r.total).toEqual(money(111.95)) // 116.95 - 5% alt-pay
  })

  it('free shipping kicks in for vial-only carts >= $250', () => {
    const r = computeOrderTotals({
      lineItems: [{ id: 'x', price: 300, quantity: 1, isKit: false }],
      paymentMethod: 'paypal',
      now: NO_PROMO,
    })
    expect(r.shipping.freeShipApplied).toBe(true)
    expect(r.shipping.total).toEqual(money(0))
    expect(r.standardTotal).toEqual(money(300))
  })

  it('cold-pack surcharge applies to kit carts (and overrides free-ship)', () => {
    const r = computeOrderTotals({
      lineItems: [{ id: 'k', price: 300, quantity: 1, isKit: true }],
      paymentMethod: 'paypal',
      now: NO_PROMO,
    })
    expect(r.shipping.hasColdPack).toBe(true)
    expect(r.shipping.total).toEqual(money(33.95)) // 16.95 + 17, no free-ship for kits
    expect(r.standardTotal).toEqual(money(333.95))
  })

  it('house order (recovery token) overrides affiliate: better % applies, affiliate zeroed (no commission)', () => {
    const r = computeOrderTotals({
      lineItems: [{ id: 'x', price: 200, quantity: 1 }],
      affiliatePct: 10,
      recoveryPct: 15, // house 15% beats the 10% code
      paymentMethod: 'paypal',
      now: NO_PROMO,
    })
    // House order: affiliate discount zeroed (and create.js strips the code → no
    // commission); the 15% shows as the recovery/house discount.
    expect(r.affiliateDiscount).toEqual(money(0))
    expect(r.affiliatePct).toEqual(0)
    expect(r.recoveryDiscount).toEqual(money(30)) // 15% of 200
    expect(r.recoveryPct).toEqual(15)
    expect(r.discountedSubtotal).toEqual(money(170))
    expect(r.standardTotal).toEqual(money(186.95)) // 170 + 16.95
  })

  it('house order never gives the customer less than their affiliate code (max of the two)', () => {
    const r = computeOrderTotals({
      lineItems: [{ id: 'x', price: 200, quantity: 1 }],
      affiliatePct: 20, // unusually generous code, bigger than the 15% house %
      recoveryPct: 15,
      paymentMethod: 'paypal',
      now: NO_PROMO,
    })
    // Customer keeps the better 20% (still no commission — affiliate stripped server-side).
    expect(r.affiliateDiscount).toEqual(money(0))
    expect(r.recoveryDiscount).toEqual(money(40)) // max(20,15)=20% of 200
    expect(r.recoveryPct).toEqual(20)
    expect(r.discountedSubtotal).toEqual(money(160))
  })

  it('house order applies fully when there is no affiliate code', () => {
    const r = computeOrderTotals({
      lineItems: [{ id: 'x', price: 200, quantity: 1 }],
      affiliatePct: 0,
      recoveryPct: 15,
      paymentMethod: 'paypal',
      now: NO_PROMO,
    })
    expect(r.affiliateDiscount).toEqual(money(0))
    expect(r.recoveryDiscount).toEqual(money(30)) // 15% of 200
    expect(r.recoveryPct).toEqual(15)
    expect(r.discountedSubtotal).toEqual(money(170))
  })

  it('no recovery token: affiliate % applies normally and commission path is intact', () => {
    const r = computeOrderTotals({
      lineItems: [{ id: 'x', price: 200, quantity: 1 }],
      affiliatePct: 10,
      recoveryPct: 0,
      paymentMethod: 'paypal',
      now: NO_PROMO,
    })
    expect(r.affiliateDiscount).toEqual(money(20)) // 10% of 200 — affiliate keeps attribution
    expect(r.affiliatePct).toEqual(10)
    expect(r.recoveryDiscount).toEqual(money(0))
    expect(r.recoveryPct).toEqual(0)
    expect(r.discountedSubtotal).toEqual(money(180))
  })

  it('Memorial Day sale applies first, then affiliate, with free shipping', () => {
    const r = computeOrderTotals({
      lineItems: [{ id: 'x', price: 100, quantity: 2 }],
      affiliatePct: 10,
      paymentMethod: 'paypal',
      now: IN_MEMORIAL,
    })
    expect(r.saleActive).toBe(true)
    expect(r.memorialDiscount).toEqual(money(30)) // 15% of 200
    expect(r.affiliateDiscount).toEqual(money(17)) // 10% of 170
    expect(r.discountedSubtotal).toEqual(money(153))
    expect(r.shipping.total).toEqual(money(0)) // sale = free ship
    expect(r.standardTotal).toEqual(money(153))
    expect(r.altPayTotal).toEqual(money(145.35)) // 153 - 7.65 (5%)
  })

  it('GLP-3 Buy-2-Get-1-Free discounts one vial per three, before affiliate (now also stacks the 3-unit volume break)', () => {
    const r = computeOrderTotals({
      lineItems: [{ id: 'glp3-10mg', price: 50, quantity: 3 }],
      paymentMethod: 'paypal',
      now: IN_BOGO,
    })
    expect(r.bogoFreeVials).toBe(1)
    expect(r.bogoDiscount).toEqual(money(50))
    // NOTE: 3 units of one SKU now also earns the 5% per-SKU volume break, so it
    // stacks with BOGO: 150 - 50 (bogo) - 7.50 (5% volume) = 92.50. BOGO is an
    // expired window (May–Jun 2026) so this stacking is inert in prod today; if
    // it's ever re-run, decide whether volume should be excluded on BOGO SKUs.
    expect(r.volumeDiscount).toEqual(money(7.5))
    expect(r.discountedSubtotal).toEqual(money(92.5))
    expect(r.standardTotal).toEqual(money(109.45)) // 92.50 + 16.95 ship
  })

  it('empty / malformed input is safe (no throw, zero totals)', () => {
    const r = computeOrderTotals({})
    expect(r.subtotal).toEqual(money(0))
    expect(r.standardTotal).toEqual(money(16.95)) // empty cart still computes base ship; callers gate on cart length
  })
})

describe('isAltPayMethod', () => {
  it('is true only for crypto and zelle', () => {
    expect(isAltPayMethod('crypto')).toBe(true)
    expect(isAltPayMethod('zelle')).toBe(true)
    expect(isAltPayMethod('paypal')).toBe(false)
    expect(isAltPayMethod('card')).toBe(false)
    expect(isAltPayMethod('venmo')).toBe(false)
    expect(isAltPayMethod(null)).toBe(false)
  })
})

describe('volumeTierPct — per-SKU quantity breaks', () => {
  it('1–2 = full price, 3–4 = 5%, 5–9 = 10%, 10+ = 15%', () => {
    expect(volumeTierPct(1)).toBe(0)
    expect(volumeTierPct(2)).toBe(0)
    expect(volumeTierPct(3)).toBe(5)
    expect(volumeTierPct(4)).toBe(5)
    expect(volumeTierPct(5)).toBe(10)
    expect(volumeTierPct(9)).toBe(10)
    expect(volumeTierPct(10)).toBe(15)
    expect(volumeTierPct(50)).toBe(15)
    expect(volumeTierPct(0)).toBe(0)
  })
})

describe('calcVolumeDiscount — per-SKU, independent lines', () => {
  it('each SKU tiers on its own quantity (no cross-combination)', () => {
    // 5 of A @ $100 → 10% = $50 off; 3 of B @ $50 → 5% = $7.50 off. Total 57.50.
    const { discount } = calcVolumeDiscount([
      { price: 100, quantity: 5 },
      { price: 50, quantity: 3 },
    ])
    expect(discount).toEqual(money(57.5))
  })
  it('two vials of different SKUs do NOT combine into a tier', () => {
    // 2 + 2 = 4 total, but per-SKU each is 2 → no discount.
    const { discount } = calcVolumeDiscount([
      { price: 100, quantity: 2 },
      { price: 100, quantity: 2 },
    ])
    expect(discount).toEqual(money(0))
  })
})

describe('computeOrderTotals — volume breaks', () => {
  it('10 of one SKU gets 15% off that line', () => {
    const r = computeOrderTotals({
      lineItems: [{ id: 'x', price: 100, quantity: 10 }],
      paymentMethod: 'paypal',
      now: NO_PROMO,
    })
    expect(r.subtotal).toEqual(money(1000))
    expect(r.volumeDiscount).toEqual(money(150)) // 15% of 1000
    expect(r.discountedSubtotal).toEqual(money(850))
    expect(r.standardTotal).toEqual(money(850)) // free-ship over threshold
  })

  it('volume STACKS with an affiliate code (volume first, then affiliate %)', () => {
    const r = computeOrderTotals({
      lineItems: [{ id: 'x', price: 100, quantity: 10 }],
      affiliatePct: 10,
      paymentMethod: 'paypal',
      now: NO_PROMO,
    })
    // 1000 - 15% volume = 850; then 10% affiliate off 850 = 85 → 765.
    expect(r.volumeDiscount).toEqual(money(150))
    expect(r.affiliateDiscount).toEqual(money(85))
    expect(r.discountedSubtotal).toEqual(money(765))
  })

  it('under 3 units of a SKU = full price (no volume discount)', () => {
    const r = computeOrderTotals({
      lineItems: [{ id: 'x', price: 100, quantity: 2 }],
      paymentMethod: 'paypal',
      now: NO_PROMO,
    })
    expect(r.volumeDiscount).toEqual(money(0))
  })
})
