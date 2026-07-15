// Pure sales-bucketing for the Analytics "Sales by period" table. Kept
// framework-free + timezone-explicit so it's unit-testable without a DB.
//
// All bucketing is done on LA CALENDAR DATES (America/Los_Angeles), not UTC —
// a sale at 9pm Pacific belongs to that Pacific day, not the next UTC day.
// The endpoint stamps each order with its LA date string (YYYY-MM-DD); every
// function here operates on those strings, so date math is pure string work
// (lexicographic compare is valid for YYYY-MM-DD).

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// Shift a YYYY-MM-DD string by n days. Anchored at noon UTC so pure date-only
// arithmetic never trips a DST/midnight boundary.
export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Monday-based day index (Mon=0 … Sun=6) for a YYYY-MM-DD string.
function mondayIndex(dateStr) {
  const dow = new Date(`${dateStr}T12:00:00Z`).getUTCDay() // Sun=0…Sat=6
  return (dow + 6) % 7
}

// Monday that starts the week containing dateStr.
export function weekStart(dateStr) {
  return addDays(dateStr, -mondayIndex(dateStr))
}

// Which "week of the month" a date falls in (1-based, calendar rows from the
// 1st): days 1-7 → 1, 8-14 → 2, … Matches "the four weeks this month".
function weekOfMonth(dateStr) {
  const day = parseInt(dateStr.slice(8, 10), 10)
  return Math.floor((day - 1) / 7) + 1
}

const monthStartOf = (dateStr) => `${dateStr.slice(0, 7)}-01`

// Last day of the month a date is in.
function monthEndOf(dateStr) {
  const [y, m] = dateStr.slice(0, 7).split('-').map(Number)
  const d = new Date(Date.UTC(y, m, 0)) // day 0 of next month = last day of this
  return d.toISOString().slice(0, 10)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fmtMD = (dateStr) => `${MONTHS[Number(dateStr.slice(5, 7)) - 1]} ${Number(dateStr.slice(8, 10))}`

export const SALES_RANGES = [
  { key: 'this_month', label: 'This month', group: 'week' },
  { key: 'last_month', label: 'Last month', group: 'week' },
  { key: 'last_4_weeks', label: 'Last 4 weeks', group: 'week' },
  { key: 'last_7_days', label: 'Last 7 days', group: 'day' },
  { key: 'ytd', label: 'Year to date', group: 'month' },
]

// The [startLA, endLA] inclusive LA-date window a range covers, given "today".
export function rangeWindow(range, todayLA) {
  switch (range) {
    case 'last_month': {
      const firstThis = monthStartOf(todayLA)
      const lastPrev = addDays(firstThis, -1)
      return { start: monthStartOf(lastPrev), end: lastPrev }
    }
    case 'last_4_weeks':
      return { start: addDays(todayLA, -27), end: todayLA }
    case 'last_7_days':
      return { start: addDays(todayLA, -6), end: todayLA }
    case 'ytd':
      return { start: `${todayLA.slice(0, 4)}-01-01`, end: todayLA }
    case 'this_month':
    default:
      return { start: monthStartOf(todayLA), end: todayLA }
  }
}

// Build the ORDERED, zero-filled bucket skeleton for a range so empty weeks/
// days still show a row (a table with gaps reads as broken).
function buildBuckets(range, todayLA) {
  const out = []
  if (range === 'this_month' || range === 'last_month') {
    const { start, end } = rangeWindow(range, todayLA)
    const monthEnd = range === 'last_month' ? monthEndOf(start) : end
    const lastWeek = weekOfMonth(monthEnd)
    for (let w = 1; w <= lastWeek; w++) {
      const from = addDays(monthStartOf(start), (w - 1) * 7)
      const toRaw = addDays(from, 6)
      const to = toRaw > monthEnd ? monthEnd : toRaw
      out.push({ key: `w${w}`, label: `Week ${w}`, sub: `${fmtMD(from)}–${fmtMD(to)}`, from, to })
    }
  } else if (range === 'last_4_weeks') {
    // 4 rolling 7-day buckets, oldest first, ending today.
    for (let i = 3; i >= 0; i--) {
      const to = addDays(todayLA, -7 * i)
      const from = addDays(to, -6)
      out.push({ key: `r${i}`, label: `${fmtMD(from)}–${fmtMD(to)}`, sub: '', from, to })
    }
  } else if (range === 'last_7_days') {
    for (let i = 6; i >= 0; i--) {
      const d = addDays(todayLA, -i)
      out.push({ key: d, label: fmtMD(d), sub: '', from: d, to: d })
    }
  } else if (range === 'ytd') {
    const year = todayLA.slice(0, 4)
    const lastMonth = Number(todayLA.slice(5, 7))
    for (let m = 1; m <= lastMonth; m++) {
      const mm = String(m).padStart(2, '0')
      out.push({ key: `${year}-${mm}`, label: MONTHS[m - 1], sub: year, from: `${year}-${mm}-01`, to: monthEndOf(`${year}-${mm}-01`) })
    }
  }
  return out
}

// Assign each order to its bucket. orders: [{ laDate, total }] (paid only —
// the caller filters). Returns { group, range, buckets:[{...,orders,revenue,
// aov}], totals, today, wtd, mtd }.
export function summarizeSales(orders, todayLA, range = 'this_month') {
  const rangeDef = SALES_RANGES.find((r) => r.key === range) || SALES_RANGES[0]
  const buckets = buildBuckets(rangeDef.key, todayLA).map((b) => ({ ...b, orders: 0, revenue: 0 }))

  const inBucket = (laDate, b) => laDate >= b.from && laDate <= b.to
  let totalOrders = 0
  let totalRevenue = 0
  const wkStart = weekStart(todayLA)
  const moStart = monthStartOf(todayLA)
  let today = { orders: 0, revenue: 0 }
  let wtd = { orders: 0, revenue: 0 }
  let mtd = { orders: 0, revenue: 0 }

  for (const o of orders) {
    const laDate = o.laDate
    const amt = Number(o.total) || 0
    if (laDate === todayLA) { today.orders += 1; today.revenue += amt }
    if (laDate >= wkStart && laDate <= todayLA) { wtd.orders += 1; wtd.revenue += amt }
    if (laDate >= moStart && laDate <= todayLA) { mtd.orders += 1; mtd.revenue += amt }
    for (const b of buckets) {
      if (inBucket(laDate, b)) { b.orders += 1; b.revenue += amt; totalOrders += 1; totalRevenue += amt; break }
    }
  }

  const finalize = (b) => ({ ...b, revenue: round2(b.revenue), aov: b.orders ? round2(b.revenue / b.orders) : 0 })
  return {
    group: rangeDef.group,
    range: rangeDef.key,
    buckets: buckets.map(finalize),
    totals: { orders: totalOrders, revenue: round2(totalRevenue), aov: totalOrders ? round2(totalRevenue / totalOrders) : 0 },
    today: { orders: today.orders, revenue: round2(today.revenue) },
    wtd: { orders: wtd.orders, revenue: round2(wtd.revenue) },
    mtd: { orders: mtd.orders, revenue: round2(mtd.revenue) },
  }
}
