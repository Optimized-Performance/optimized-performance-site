import { describe, it, expect } from 'vitest'
import { pickRate } from './shippo.js'

const r = (id, provider, token, amount, shape = 'nested') => ({
  object_id: id,
  provider,
  amount: String(amount),
  ...(shape === 'nested' ? { servicelevel: { token } } : { servicelevel_token: token }),
})

describe('pickRate', () => {
  it('prefers the requested service, cheapest first', () => {
    const rates = [
      r('a', 'USPS', 'usps_priority', 9.5),
      r('b', 'USPS', 'usps_ground_advantage', 6.2),
      r('c', 'USPS', 'usps_ground_advantage', 5.9),
      r('d', 'UPS', 'ups_ground', 4.0),
    ]
    expect(pickRate(rates, 'usps_ground_advantage').object_id).toBe('c')
  })

  it('reads the flat servicelevel_token shape too', () => {
    const rates = [r('a', 'USPS', 'usps_priority', 9.5, 'flat'), r('b', 'UPS', 'ups_ground', 2.0)]
    expect(pickRate(rates, 'usps_priority').object_id).toBe('a')
  })

  it('falls back to cheapest USPS when the preferred service is missing', () => {
    const rates = [
      r('a', 'USPS', 'usps_priority_express', 30),
      r('b', 'USPS', 'usps_priority', 9.5),
      r('c', 'UPS', 'ups_ground', 4.0),
    ]
    expect(pickRate(rates, 'usps_ground_advantage').object_id).toBe('b')
  })

  it('falls back to cheapest overall when no USPS rates exist', () => {
    const rates = [r('a', 'UPS', 'ups_ground', 8), r('b', 'FedEx', 'fedex_ground', 6.5)]
    expect(pickRate(rates, 'usps_ground_advantage').object_id).toBe('b')
  })

  it('returns null on empty/invalid rates', () => {
    expect(pickRate([], 'usps_priority')).toBe(null)
    expect(pickRate([{ amount: '0' }], 'usps_priority')).toBe(null)
  })
})
