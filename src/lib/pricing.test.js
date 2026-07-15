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
    expect(r.shipping.total).toEqual(money(17.95)) // default tier = 2-Day $17.95
    expect(r.standardTotal).toEqual(money(117.95))
    expect(r.altPayDiscount).toEqual(money(5)) // 5% of 100
    expect(r.altPayTotal).toEqual(money(112.95)) // 117.95 - 5
    expect(r.total).toEqual(money(117.95)) // non-alt rail pays standard
  })

  it('alt-pay rail (crypto) charges the alt-pay total', () => {
    const r = computeOrderTotals({
      lineItems: [{ id: 'x', price: 100, quantity: 1 }],
      paymentMethod: 'crypto',
      now: NO_PROMO,
    })
    expect(r.total).toEqual(money(112.95)) // 117.95 - 5% alt-pay
  })

  it('shipping tiers: ground $9.95, 2-day $17.95, overnight $59.95', () => {
    const cart = [{ id: 'x', price: 100, quantity: 1 }]
    expect(computeOrderTotals({ lineItems: cart, shippingMethod: 'ground', now: NO_PROMO }).shipping.total).toEqual(money(9.95))
    expect(computeOrderTotals({ lineItems: cart, shippingMethod: 'twoday', now: NO_PROMO }).shipping.total).toEqual(money(17.95))
    expect(computeOrderTotals({ lineItems: cart, shippingMethod: 'overnight', now: NO_PROMO }).shipping.total).toEqual(money(59.95))
  })

  it('free shipping is GROUND-only at $250+ (2-Day still pays its rate)', () => {
    const cart = [{ id: 'x', price: 300, quantity: 1 }]
    const ground = computeOrderTotals({ lineItems: cart, shippingMethod: 'ground', paymentMethod: 'paypal', now: NO_PROMO })
    expect(ground.shipping.freeShipApplied).toBe(true)
    expect(ground.shipping.total).toEqual(money(0))
    expect(ground.standardTotal).toEqual(money(300))
    // 2-Day at the same subtotal is NOT free.
    const twoday = computeOrderTotals({ lineItems: cart, shippingMethod: 'twoday', paymentMethod: 'paypal', now: NO_PROMO })
    expect(twoday.shipping.freeShipApplied).toBe(false)
    expect(twoday.shipping.total).toEqual(money(17.95))
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
    expect(r.standardTotal).toEqual(money(187.95)) // 170 + 17.95 (default 2-Day)
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

  it('Memorial Day sale applies first, then affiliate; sale = free GROUND shipping', () => {
    const r = computeOrderTotals({
      lineItems: [{ id: 'x', price: 100, quantity: 2 }],
      affiliatePct: 10,
      paymentMethod: 'paypal',
      shippingMethod: 'ground', // sale free-ship is ground-only (2026-07-14)
      now: IN_MEMORIAL,
    })
    expect(r.saleActive).toBe(true)
    expect(r.memorialDiscount).toEqual(money(30)) // 15% of 200
    expect(r.affiliateDiscount).toEqual(money(17)) // 10% of 170
    expect(r.discountedSubtotal).toEqual(money(153))
    expect(r.shipping.total).toEqual(money(0)) // sale frees the ground tier
    expect(r.standardTotal).toEqual(money(153))
    expect(r.altPayTotal).toEqual(money(145.35)) // 153 - 7.65 (5%)
  })

  it('site-wide sale does NOT free the paid 2-Day/Overnight tiers', () => {
    const r = computeOrderTotals({
      lineItems: [{ id: 'x', price: 100, quantity: 2 }],
      paymentMethod: 'paypal',
      shippingMethod: 'twoday',
      now: IN_MEMORIAL,
    })
    expect(r.saleActive).toBe(true)
    expect(r.shipping.total).toEqual(money(17.95))
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
    expect(r.standardTotal).toEqual(money(110.45)) // 92.50 + 17.95 ship (default 2-Day)
  })

  it('empty / malformed input is safe (no throw, zero totals)', () => {
    const r = computeOrderTotals({})
    expect(r.subtotal).toEqual(money(0))
    expect(r.standardTotal).toEqual(money(17.95)) // empty cart still computes default 2-Day ship; callers gate on cart length
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
  it('HGH (supply-constrained hero) is excluded from volume breaks', () => {
    // 10 HGH kits would be 15% if eligible — excluded, so zero.
    expect(calcVolumeDiscount([{ id: 'hgh-10iu', price: 239.95, quantity: 10 }]).discount).toEqual(money(0))
    expect(calcVolumeDiscount([{ id: 'hgh-24iu', price: 514.95, quantity: 10 }]).discount).toEqual(money(0))
    // A non-HGH line in the same cart still tiers normally.
    const { discount } = calcVolumeDiscount([
      { id: 'hgh-10iu', price: 239.95, quantity: 10 },
      { id: 'bpc-10mg', price: 100, quantity: 10 },
    ])
    expect(discount).toEqual(money(150)) // only the BPC line: 15% of 1000
  })
})

describe('computeOrderTotals — volume breaks', () => {
  it('10 of one SKU gets 15% off that line', () => {
    const r = computeOrderTotals({
      lineItems: [{ id: 'x', price: 100, quantity: 10 }],
      paymentMethod: 'paypal',
      shippingMethod: 'ground', // free over $250 on ground
      now: NO_PROMO,
    })
    expect(r.subtotal).toEqual(money(1000))
    expect(r.volumeDiscount).toEqual(money(150)) // 15% of 1000
    expect(r.discountedSubtotal).toEqual(money(850))
    expect(r.standardTotal).toEqual(money(850)) // free Ground shipping over threshold
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

// Canada shipping (2026-07-11): flat $50 international — immune to the
// free-shipping threshold, site-wide sales, and the cold-pack surcharge.
import { CANADA_SHIPPING_FLAT } from './shipping.js'

describe('Canada shipping (flat $50)', () => {
  const money = (v) => expect.closeTo(v, 2)
  const NO_PROMO = new Date('2026-06-10T12:00:00Z')
  const IN_MEMORIAL = new Date('2026-05-24T12:00:00Z')

  it('charges the flat rate on a small vial cart', () => {
    const r = computeOrderTotals({
      lineItems: [{ id: 'x', price: 100, quantity: 1, isKit: false }],
      paymentMethod: 'card',
      country: 'CA',
      now: NO_PROMO,
    })
    expect(r.shipping.total).toEqual(money(CANADA_SHIPPING_FLAT))
    expect(r.shipping.international).toBe(true)
    expect(r.standardTotal).toEqual(money(150))
  })

  it('ignores the free-shipping threshold', () => {
    const r = computeOrderTotals({
      lineItems: [{ id: 'x', price: 300, quantity: 1, isKit: false }],
      paymentMethod: 'card',
      country: 'CA',
      now: NO_PROMO,
    })
    expect(r.shipping.total).toEqual(money(CANADA_SHIPPING_FLAT))
    expect(r.shipping.freeShipApplied).toBe(false)
  })

  it('ignores the site-wide sale free-shipping override', () => {
    const r = computeOrderTotals({
      lineItems: [{ id: 'x', price: 100, quantity: 1, isKit: false }],
      paymentMethod: 'card',
      country: 'CA',
      now: IN_MEMORIAL,
    })
    expect(r.shipping.total).toEqual(money(CANADA_SHIPPING_FLAT))
  })

  it('flat rate is immune to the chosen US tier (Canada ignores shippingMethod)', () => {
    const r = computeOrderTotals({
      lineItems: [{ id: 'x', price: 100, quantity: 1 }],
      paymentMethod: 'card',
      country: 'CA',
      shippingMethod: 'overnight', // ignored for CA
      now: NO_PROMO,
    })
    expect(r.shipping.total).toEqual(money(CANADA_SHIPPING_FLAT))
    expect(r.shipping.method).toBe('canada')
  })

  it('US default stays on the domestic tier table', () => {
    const r = computeOrderTotals({
      lineItems: [{ id: 'x', price: 100, quantity: 1, isKit: false }],
      paymentMethod: 'card',
      now: NO_PROMO,
    })
    expect(r.shipping.total).toEqual(money(17.95)) // default 2-Day
  })
})
