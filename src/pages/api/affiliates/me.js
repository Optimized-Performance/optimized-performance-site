import { validateAffiliateToken } from '../../../lib/affiliate-session'
import { supabaseAdmin } from '../../../lib/supabase'
import { rateLimit } from '../../../lib/security'
import { calcCommission } from '../../../lib/commission'

// Tier table — direct affiliates. Recruited affiliates use the same thresholds
// but the cron applies a -recruiter_override_pct adjustment to commission_pct.
// (See docs/affiliate-program-spec.md)
const TIER_THRESHOLDS = [
  { min: 0,      max: 9999,    rate: 10 },
  { min: 10000,  max: 19999,   rate: 15 },
  { min: 20000,  max: 34999,   rate: 20 },
  { min: 35000,  max: 59999,   rate: 25 },
  { min: 60000,  max: Infinity, rate: 30 },
]

function periodKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function previousPeriodKey(d = new Date()) {
  const prev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))
  return periodKey(prev)
}

function periodRange(periodKey) {
  const [y, m] = periodKey.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, 1))
  const end = new Date(Date.UTC(y, m, 1))
  return { start: start.toISOString(), end: end.toISOString() }
}

// Aggregates volume + actual commission from per-order snapshots
// (orders.affiliate_commission_pct, written at order-create time). Falls back
// to 0 commission for any order missing a snapshot (after migration v6 backfill,
// shouldn't happen, but defensive).
async function sumOrdersWithCommission(code, start, end) {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('total, shipping, affiliate_commission_pct')
    .eq('affiliate_code', code)
    .eq('payment_status', 'completed')
    .gte('created_at', start)
    .lt('created_at', end)
  if (error) throw error
  let total = 0
  let commission = 0
  for (const o of data || []) {
    // Volume = gross sales (what the customer paid); commission excludes
    // shipping (logistics pass-through, not commissionable — see lib/commission).
    total += Number(o.total || 0)
    commission += calcCommission(o)
  }
  return { total, commission, count: (data || []).length }
}

async function sumPeriod(code, periodKey) {
  const { start, end } = periodRange(periodKey)
  return sumOrdersWithCommission(code, start, end)
}

async function sumYtd(code) {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString()
  const end = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1)).toISOString()
  return sumOrdersWithCommission(code, start, end)
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  if (!rateLimit(req, { maxRequests: 60, windowMs: 60000 })) {
    return res.status(429).json({ error: 'Too many requests' })
  }

  const token = req.headers['x-affiliate-token']
  const session = validateAffiliateToken(token)
  if (!session) return res.status(401).json({ error: 'Invalid or expired token' })

  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  try {
    // Affiliate row
    const { data: aff, error: affErr } = await supabaseAdmin
      .from('affiliates')
      .select('id, code, name, email, commission_pct, discount_pct, active, parent_affiliate_id, is_flat_rate, recruiter_override_pct, total_sales, total_revenue, total_commission, created_at')
      .eq('id', session.affiliateId)
      .single()

    if (affErr || !aff) return res.status(404).json({ error: 'Affiliate not found' })
    if (!aff.active) return res.status(403).json({ error: 'Affiliate account is inactive' })

    // MTD + last-month + YTD volume + actual commission (from per-order snapshots)
    const thisPeriod = periodKey()
    const lastPeriod = previousPeriodKey()
    const [mtd, lastMonth, ytd] = await Promise.all([
      sumPeriod(aff.code, thisPeriod),
      sumPeriod(aff.code, lastPeriod),
      sumYtd(aff.code),
    ])

    // Pending payouts (paid_at IS NULL)
    const { data: pendingPayouts, error: payErr } = await supabaseAdmin
      .from('affiliate_payouts')
      .select('id, payout_type, period, amount, notes, created_at')
      .eq('affiliate_id', aff.id)
      .is('paid_at', null)
      .order('created_at', { ascending: false })
    if (payErr) throw payErr

    const pendingTotal = (pendingPayouts || []).reduce((s, p) => s + Number(p.amount || 0), 0)

    // YTD payouts processed (cron-driven payouts created this year — overrides + royalties)
    const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)).toISOString()
    const { data: ytdPayouts } = await supabaseAdmin
      .from('affiliate_payouts')
      .select('amount, payout_type')
      .eq('affiliate_id', aff.id)
      .gte('created_at', yearStart)
    const ytdPayoutsTotal = (ytdPayouts || []).reduce((s, p) => s + Number(p.amount || 0), 0)

    // Whether they have a network they can recruit into
    const hasNetwork = Number(aff.recruiter_override_pct || 0) > 0

    return res.status(200).json({
      affiliate: {
        id: aff.id,
        code: aff.code,
        name: aff.name,
        email: aff.email,
        commission_pct: Number(aff.commission_pct || 0),
        discount_pct: Number(aff.discount_pct || 0),
        has_network: hasNetwork,
        member_since: aff.created_at,
      },
      stats: {
        mtd_volume: mtd.total,
        mtd_orders: mtd.count,
        mtd_commission: mtd.commission,
        last_month_volume: lastMonth.total,
        last_month_orders: lastMonth.count,
        last_month_commission: lastMonth.commission,
        ytd_volume: ytd.total,
        ytd_orders: ytd.count,
        ytd_commission: ytd.commission,
        ytd_payouts_total: ytdPayoutsTotal,
        lifetime_volume: Number(aff.total_revenue || 0),
        lifetime_orders: Number(aff.total_sales || 0),
        lifetime_commission: Number(aff.total_commission || 0),
      },
      pending_payouts: pendingPayouts || [],
      pending_total: pendingTotal,
    })
  } catch (err) {
    console.error('Affiliate me error:', err)
    return res.status(500).json({ error: 'Internal error' })
  }
}
