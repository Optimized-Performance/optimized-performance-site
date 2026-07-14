import { describe, it, expect } from 'vitest'
import { pickRate, preferredServiceToken } from './shippo.js'

const r = (id, provider, token, amount, shape = 'nested') => ({
  object_id: id,
  provider,
  amount: String(amount),
  ...(shape === 'nested' ? { servicelevel: { token } } : { servicelevel_token: token }),
})

describe('preferredServiceToken', () => {
  it('defaults to UPS 2nd Day Air', () => {
    expect(preferredServiceToken()).toBe('ups_second_day_air')
  })
})

describe('pickRate', () => {
  it('picks the exact preferred service, cheapest if duplicated', () => {
    const rates = [
      r('a', 'UPS', 'ups_second_day_air', 18.5),
      r('b', 'UPS', 'ups_second_day_air', 17.9),
      r('c', 'UPS', 'ups_ground', 9.0),
      r('d', 'USPS', 'usps_priority', 8.2),
    ]
    expect(pickRate(rates, 'ups_second_day_air').object_id).toBe('b')
  })

  it('reads the flat servicelevel_token shape too', () => {
    const rates = [r('a', 'UPS', 'ups_second_day_air', 18.5, 'flat'), r('b', 'USPS', 'usps_priority', 8)]
    expect(pickRate(rates, 'ups_second_day_air').object_id).toBe('a')
  })

  it('falls back to cheapest SAME-CARRIER service when the exact one is missing', () => {
    // No 2nd Day Air for this lane — stay on UPS (ground) before jumping carrier.
    const rates = [
      r('a', 'UPS', 'ups_3_day_select', 14),
      r('b', 'UPS', 'ups_ground', 9.5),
      r('c', 'USPS', 'usps_priority', 7),
    ]
    expect(pickRate(rates, 'ups_second_day_air').object_id).toBe('b')
  })

  it('falls back to cheapest overall when the preferred carrier is absent', () => {
    const rates = [r('a', 'USPS', 'usps_priority', 8), r('b', 'USPS', 'usps_ground_advantage', 6.5)]
    expect(pickRate(rates, 'ups_second_day_air').object_id).toBe('b')
  })

  it('honors a re-pointed preferred token (e.g. USPS priority)', () => {
    const rates = [r('a', 'UPS', 'ups_second_day_air', 18), r('b', 'USPS', 'usps_priority', 8)]
    expect(pickRate(rates, 'usps_priority').object_id).toBe('b')
  })

  it('returns null on empty/invalid rates', () => {
    expect(pickRate([], 'ups_second_day_air')).toBe(null)
    expect(pickRate([{ amount: '0' }], 'ups_second_day_air')).toBe(null)
  })
})
