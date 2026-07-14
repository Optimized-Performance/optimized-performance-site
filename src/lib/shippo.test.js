import { describe, it, expect } from 'vitest'
import { pickRate, preferredServiceTokens } from './shippo.js'

const r = (id, provider, token, amount, shape = 'nested') => ({
  object_id: id,
  provider,
  amount: String(amount),
  ...(shape === 'nested' ? { servicelevel: { token } } : { servicelevel_token: token }),
})

const LADDER = ['ups_second_day_air', 'usps_priority']

describe('preferredServiceTokens', () => {
  it('defaults to UPS 2nd Day Air then USPS Priority', () => {
    expect(preferredServiceTokens()).toEqual(['ups_second_day_air', 'usps_priority'])
  })
})

describe('pickRate — ordered service ladder', () => {
  it('takes UPS 2nd Day Air when present, even if pricier than lower rungs', () => {
    const rates = [
      r('a', 'UPS', 'ups_second_day_air', 18.5),
      r('b', 'USPS', 'usps_priority', 8.2),
      r('c', 'UPS', 'ups_ground', 6.0),
    ]
    expect(pickRate(rates, LADDER).object_id).toBe('a')
  })

  it('cheapest wins within the matched rung (duplicate 2nd Day Air)', () => {
    const rates = [
      r('a', 'UPS', 'ups_second_day_air', 18.5),
      r('b', 'UPS', 'ups_second_day_air', 17.9),
    ]
    expect(pickRate(rates, LADDER).object_id).toBe('b')
  })

  it('falls to USPS Priority when 2nd Day Air is not returned', () => {
    const rates = [
      r('a', 'UPS', 'ups_ground', 9),
      r('b', 'USPS', 'usps_priority', 8.2),
      r('c', 'USPS', 'usps_ground_advantage', 6.5),
    ]
    expect(pickRate(rates, LADDER).object_id).toBe('b')
  })

  it('reads the flat servicelevel_token shape too', () => {
    const rates = [r('a', 'USPS', 'usps_priority', 8, 'flat'), r('b', 'USPS', 'usps_ground_advantage', 6)]
    expect(pickRate(rates, LADDER).object_id).toBe('a')
  })

  it('drops to cheapest overall only when NO preferred rung is available', () => {
    const rates = [r('a', 'UPS', 'ups_ground', 9), r('b', 'FedEx', 'fedex_ground', 6.5)]
    expect(pickRate(rates, LADDER).object_id).toBe('b')
  })

  it('returns null on empty/invalid rates', () => {
    expect(pickRate([], LADDER)).toBe(null)
    expect(pickRate([{ amount: '0' }], LADDER)).toBe(null)
  })
})
