import { describe, it, expect } from 'vitest'
import { summarizeSales, rangeWindow, addDays, weekStart, SALES_RANGES } from './sales-summary.js'

const o = (laDate, total) => ({ laDate, total })

describe('date helpers', () => {
  it('addDays crosses month boundaries', () => {
    expect(addDays('2026-07-01', -1)).toBe('2026-06-30')
    expect(addDays('2026-07-31', 1)).toBe('2026-08-01')
  })
  it('weekStart returns the Monday of the week', () => {
    // 2026-07-14 is a Tuesday → Monday is 2026-07-13
    expect(weekStart('2026-07-14')).toBe('2026-07-13')
    // 2026-07-13 (Mon) → itself
    expect(weekStart('2026-07-13')).toBe('2026-07-13')
  })
})

describe('rangeWindow', () => {
  it('this_month = 1st through today', () => {
    expect(rangeWindow('this_month', '2026-07-14')).toEqual({ start: '2026-07-01', end: '2026-07-14' })
  })
  it('last_month = full prior calendar month', () => {
    expect(rangeWindow('last_month', '2026-07-14')).toEqual({ start: '2026-06-01', end: '2026-06-30' })
  })
  it('last_7_days = trailing 7 inclusive', () => {
    expect(rangeWindow('last_7_days', '2026-07-14')).toEqual({ start: '2026-07-08', end: '2026-07-14' })
  })
  it('ytd = Jan 1 through today', () => {
    expect(rangeWindow('ytd', '2026-07-14')).toEqual({ start: '2026-01-01', end: '2026-07-14' })
  })
})

describe('summarizeSales — this_month weekly', () => {
  const orders = [
    o('2026-07-01', 100), // wk1
    o('2026-07-07', 50),  // wk1
    o('2026-07-08', 200), // wk2
    o('2026-07-14', 30),  // wk2 (today)
  ]
  const s = summarizeSales(orders, '2026-07-14', 'this_month')

  it('buckets into weeks of the month, zero-filled + ordered', () => {
    expect(s.buckets.map((b) => b.label)).toEqual(['Week 1', 'Week 2'])
    expect(s.buckets[0]).toMatchObject({ orders: 2, revenue: 150 })
    expect(s.buckets[1]).toMatchObject({ orders: 2, revenue: 230 })
  })
  it('week 1 spans the 1st–7th, week 2 the 8th–14th', () => {
    expect(s.buckets[0]).toMatchObject({ from: '2026-07-01', to: '2026-07-07' })
    expect(s.buckets[1]).toMatchObject({ from: '2026-07-08', to: '2026-07-14' })
  })
  it('totals + AOV', () => {
    expect(s.totals).toEqual({ orders: 4, revenue: 380, aov: 95 })
    expect(s.buckets[1].aov).toBe(115)
  })
  it('today / WTD / MTD scalars (LA dates)', () => {
    // today = 07-14 only. WTD = week of Mon 07-13 → only 07-14 falls in it
    // (07-08 is the prior Mon-Sun week). MTD = all four July orders.
    expect(s.today).toEqual({ orders: 1, revenue: 30 })
    expect(s.wtd).toEqual({ orders: 1, revenue: 30 })
    expect(s.mtd).toEqual({ orders: 4, revenue: 380 })
  })
})

describe('summarizeSales — an order outside the range is ignored in buckets', () => {
  it('drops a June order from a this_month view', () => {
    const s = summarizeSales([o('2026-06-30', 999), o('2026-07-02', 10)], '2026-07-14', 'this_month')
    expect(s.totals.revenue).toBe(10)
  })
})

describe('summarizeSales — last_7_days daily', () => {
  it('produces 7 ordered daily buckets ending today', () => {
    const s = summarizeSales([o('2026-07-14', 40), o('2026-07-10', 20)], '2026-07-14', 'last_7_days')
    expect(s.buckets).toHaveLength(7)
    expect(s.buckets[0].from).toBe('2026-07-08')
    expect(s.buckets[6].from).toBe('2026-07-14')
    expect(s.buckets[6]).toMatchObject({ orders: 1, revenue: 40 })
  })
})

describe('summarizeSales — ytd monthly', () => {
  it('one bucket per month Jan..current', () => {
    const s = summarizeSales([o('2026-01-15', 100), o('2026-07-01', 300)], '2026-07-14', 'ytd')
    expect(s.buckets).toHaveLength(7)
    expect(s.buckets[0]).toMatchObject({ label: 'Jan', orders: 1, revenue: 100 })
    expect(s.buckets[6]).toMatchObject({ label: 'Jul', orders: 1, revenue: 300 })
  })
})

it('SALES_RANGES all round-trip through summarizeSales without throwing', () => {
  for (const r of SALES_RANGES) {
    expect(() => summarizeSales([], '2026-07-14', r.key)).not.toThrow()
  }
})
