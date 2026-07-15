import { supabaseAdmin } from '../../../lib/supabase'
import { validateSessionToken } from '../../../lib/session'
import { validateOrigin, rateLimit } from '../../../lib/security'
import { summarizeSales, rangeWindow, addDays, SALES_RANGES } from '../../../lib/sales-summary'

// Sales-by-period table for the Analytics tab. Buckets PAID orders by LA
// calendar date (America/Los_Angeles) — a 9pm Pacific sale counts on that
// Pacific day, not the next UTC day. Returns the bucketed rows for the
// requested range plus today/WTD/MTD scalars (always, regardless of range).
//
// GET ?range=this_month|last_month|last_4_weeks|last_7_days|ytd

export const config = { maxDuration: 20 }
const ORDER_CAP = 20000
const TZ = 'America/Los_Angeles'

// YYYY-MM-DD for a Date in LA (DST-correct via Intl, not a fixed offset).
function laDate(d) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

function requireAuth(req) {
  return validateSessionToken(req.headers['x-admin-token'])
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 60, windowMs: 60000 })) return res.status(429).json({ error: 'Too many requests' })
  if (!requireAuth(req)) return res.status(401).json({ error: 'Unauthorized' })
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  const range = SALES_RANGES.some((r) => r.key === req.query.range) ? req.query.range : 'this_month'

  try {
    const todayLA = laDate(new Date())
    // Fetch enough history to cover BOTH the requested range and the always-on
    // MTD scalar. Lower bound = earliest LA date we need, minus a 2-day buffer
    // so no LA-boundary order is missed, converted to a UTC instant for the query.
    const { start: rangeStart } = rangeWindow(range, todayLA)
    const monthStart = `${todayLA.slice(0, 7)}-01`
    const earliestLA = rangeStart < monthStart ? rangeStart : monthStart
    const queryFromIso = new Date(`${addDays(earliestLA, -2)}T00:00:00Z`).toISOString()

    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('total, created_at, payment_status')
      .eq('payment_status', 'completed')
      .gte('created_at', queryFromIso)
      .order('created_at', { ascending: true })
      .limit(ORDER_CAP)
    if (error) throw error

    const orders = (data || []).map((o) => ({ laDate: laDate(new Date(o.created_at)), total: o.total }))
    const summary = summarizeSales(orders, todayLA, range)

    return res.status(200).json({
      today_la: todayLA,
      ranges: SALES_RANGES.map(({ key, label }) => ({ key, label })),
      ...summary,
    })
  } catch (err) {
    console.error('[admin/sales-summary]', err)
    return res.status(500).json({ error: err.message })
  }
}
