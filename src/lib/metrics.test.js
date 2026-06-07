import { describe, it, expect } from 'vitest'
import { formatMetric } from './metrics.js'

describe('formatMetric', () => {
  it('emits the event name + JSON fields', () => {
    expect(formatMetric('order_create', { method: 'paypal', ok: true }))
      .toBe('[metric] order_create {"method":"paypal","ok":true}')
  })

  it('rounds numeric values to whole ms', () => {
    expect(formatMetric('x', { ms: 12.7 })).toBe('[metric] x {"ms":13}')
  })

  it('drops undefined fields (so optional timings stay out of the line)', () => {
    expect(formatMetric('x', { a: 1, b: undefined })).toBe('[metric] x {"a":1}')
  })

  it('handles no fields', () => {
    expect(formatMetric('ping')).toBe('[metric] ping {}')
  })
})
