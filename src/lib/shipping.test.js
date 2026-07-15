import { describe, it, expect } from 'vitest'
import {
  calcShipping, getShippingTier, getServiceLadder,
  SHIPPING_TIERS, CANADA_SHIPPING_FLAT, FREE_SHIPPING_THRESHOLD, DEFAULT_SHIPPING_METHOD,
} from './shipping.js'

const money = (v) => expect.closeTo(v, 2)

describe('SHIPPING_TIERS config', () => {
  it('has the three priced US tiers', () => {
    expect(SHIPPING_TIERS.map((t) => [t.id, t.price])).toEqual([
      ['ground', 9.95], ['twoday', 17.95], ['overnight', 59.95],
    ])
  })
  it('only ground is free-eligible', () => {
    expect(SHIPPING_TIERS.filter((t) => t.freeEligible).map((t) => t.id)).toEqual(['ground'])
  })
  it('default is 2-Day', () => {
    expect(DEFAULT_SHIPPING_METHOD).toBe('twoday')
  })
})

describe('getShippingTier', () => {
  it('resolves known ids', () => {
    expect(getShippingTier('overnight').price).toBe(59.95)
  })
  it('falls back to the default (2-Day) for unknown/absent', () => {
    expect(getShippingTier('bogus').id).toBe('twoday')
    expect(getShippingTier(undefined).id).toBe('twoday')
  })
})

describe('calcShipping — US tiers', () => {
  it('charges each tier its price under the free threshold', () => {
    const args = { items: [], discountedSubtotal: 100 }
    expect(calcShipping({ ...args, shippingMethod: 'ground' }).total).toEqual(money(9.95))
    expect(calcShipping({ ...args, shippingMethod: 'twoday' }).total).toEqual(money(17.95))
    expect(calcShipping({ ...args, shippingMethod: 'overnight' }).total).toEqual(money(59.95))
  })

  it('frees GROUND at the threshold but not 2-Day/Overnight', () => {
    const at = { items: [], discountedSubtotal: FREE_SHIPPING_THRESHOLD }
    expect(calcShipping({ ...at, shippingMethod: 'ground' }).total).toEqual(money(0))
    expect(calcShipping({ ...at, shippingMethod: 'ground' }).freeShipApplied).toBe(true)
    expect(calcShipping({ ...at, shippingMethod: 'twoday' }).total).toEqual(money(17.95))
    expect(calcShipping({ ...at, shippingMethod: 'overnight' }).total).toEqual(money(59.95))
  })

  it('a site-wide sale frees only the ground tier', () => {
    const sale = { items: [], discountedSubtotal: 50, saleActive: true }
    expect(calcShipping({ ...sale, shippingMethod: 'ground' }).total).toEqual(money(0))
    expect(calcShipping({ ...sale, shippingMethod: 'twoday' }).total).toEqual(money(17.95))
  })

  it('unknown method defaults to 2-Day pricing', () => {
    expect(calcShipping({ items: [], discountedSubtotal: 50, shippingMethod: 'xyz' }).total).toEqual(money(17.95))
  })
})

describe('calcShipping — Canada', () => {
  it('is a flat rate immune to tier, threshold, and sale', () => {
    const base = { items: [], country: 'CA' }
    expect(calcShipping({ ...base, discountedSubtotal: 50 }).total).toEqual(money(CANADA_SHIPPING_FLAT))
    expect(calcShipping({ ...base, discountedSubtotal: 999, shippingMethod: 'overnight' }).total).toEqual(money(CANADA_SHIPPING_FLAT))
    expect(calcShipping({ ...base, discountedSubtotal: 999, saleActive: true }).total).toEqual(money(CANADA_SHIPPING_FLAT))
    expect(calcShipping({ ...base, discountedSubtotal: 50 }).international).toBe(true)
    expect(calcShipping({ ...base, discountedSubtotal: 50 }).method).toBe('canada')
  })
})

describe('getServiceLadder — tier drives the label carrier', () => {
  it('maps each tier to [UPS service, USPS fallback]', () => {
    expect(getServiceLadder('ground')).toEqual(['ups_ground', 'usps_ground_advantage'])
    expect(getServiceLadder('twoday')).toEqual(['ups_second_day_air', 'usps_priority'])
    expect(getServiceLadder('overnight')).toEqual(['ups_next_day_air', 'usps_priority_express'])
  })
  it('unknown method falls back to the 2-Day ladder', () => {
    expect(getServiceLadder('nope')).toEqual(['ups_second_day_air', 'usps_priority'])
  })
})
