import { describe, it, expect } from 'vitest'
import { computeOrderTotals, isAltPayMethod } from './pricing.js'

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
    expect(r.altPayDiscount).toEqual(money(10))
    expect(r.altPayTotal).toEqual(money(106.95))
    expect(r.total).toEqual(money(116.95)) // non-alt rail pays standard
  })

  it('alt-pay rail (crypto) charges the alt-pay total', () => {
    const r = computeOrderTotals({
      lineItems: [{ id: 'x', price: 100, quantity: 1 }],
      paymentMethod: 'crypto',
      now: NO_PROMO,
    })
    expect(r.total).toEqual(money(106.95))
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

  it('affiliate % then recovery % stack multiplicatively, pre-shipping', () => {
    const r = computeOrderTotals({
      lineItems: [{ id: 'x', price: 200, quantity: 1 }],
      affiliatePct: 10,
      recoveryPct: 5,
      paymentMethod: 'paypal',
      now: NO_PROMO,
    })
    expect(r.affiliateDiscount).toEqual(money(20)) // 10% of 200
    expect(r.recoveryDiscount).toEqual(money(9)) // 5% of 180
    expect(r.discountedSubtotal).toEqual(money(171))
    expect(r.standardTotal).toEqual(money(187.95)) // 171 + 16.95
    expect(r.altPayTotal).toEqual(money(170.85)) // 187.95 - 17.10
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
    expect(r.altPayTotal).toEqual(money(137.7)) // 153 - 15.30
  })

  it('GLP-3 Buy-2-Get-1-Free discounts one vial per three, before affiliate', () => {
    const r = computeOrderTotals({
      lineItems: [{ id: 'glp3-10mg', price: 50, quantity: 3 }],
      paymentMethod: 'paypal',
      now: IN_BOGO,
    })
    expect(r.bogoFreeVials).toBe(1)
    expect(r.bogoDiscount).toEqual(money(50))
    expect(r.discountedSubtotal).toEqual(money(100)) // 150 - 50
    expect(r.standardTotal).toEqual(money(116.95))
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
