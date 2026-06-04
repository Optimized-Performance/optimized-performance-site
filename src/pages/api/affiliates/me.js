import { validateAffiliateToken } from '../../../lib/affiliate-session'
import { supabaseAdmin } from '../../../lib/supabase'
import { rateLimit } from '../../../lib/security'
import { calcCommission, commissionableTotal } from '../../../lib/commission'
import { ROYALTY_PCT } from '../../../lib/affiliate-config'

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

// Company-wide gross (commissionable = shipping-excluded) for a period — the
// royalty basis. Mirrors the cron's sumGrossRevenue so the projection matches
// what actually gets paid.
async function sumOppGross(pk) {
  const { start, end } = periodRange(pk)
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('total, shipping')
    .eq('payment_status', 'completed')
    .gte('created_at', start)
    .lt('created_at', end)
  if (error) throw error
  return (data || []).reduce((s, o) => s + commissionableTotal(o), 0)
}

// Payment funnel for one affiliate's referred orders — completion + card/PayPal
// fall-off. Counts all statuses (not just completed). "Completion" and "fall-off"
// are computed on RESOLVED attempts only (completed + abandoned), so stranded
// 'awaiting' rows (e.g. started checkout, paid another way) don't distort them.
const CARD_RAILS = ['card', 'paypal']
async function affiliateFunnel(code) {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('payment_status, payment_method')
    .eq('affiliate_code', code)
  if (error) throw error
  let completed = 0
  let abandoned = 0
  let cardCompleted = 0
  let cardAbandoned = 0
  for (const o of data || []) {
    const s = o.payment_status
    const isCard = CARD_RAILS.includes(o.payment_method)
    if (s === 'completed' || s === 'refunded') {
      completed += 1
      if (isCard) cardCompleted += 1
    } else if (s === 'abandoned') {
      abandoned += 1
      if (isCard) cardAbandoned += 1
    }
  }
  const resolved = completed + abandoned
  const cardResolved = cardCompleted + cardAbandoned
  return {
    completed,
    abandoned,
    completionRate: resolved > 0 ? completed / resolved : null,
    cardAttempts: cardResolved,
    cardFallOffRate: cardResolved > 0 ? cardAbandoned / cardResolved : null,
  }
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

    // Payment funnel for this affiliate's referred orders
    const funnel = await affiliateFunnel(aff.code)

    // Royalty tracking — only for flat-rate primaries (e.g. Tris). Royalty is
    // ROYALTY_PCT of OPP's TOTAL gross, so the projection reveals gross by
    // division — that's the partner's contractual basis, so it's theirs to see.
    const royaltyEligible = aff.is_flat_rate === true
    let royalty = { eligible: false }
    if (royaltyEligible) {
      const { data: royaltyPayouts } = await supabaseAdmin
        .from('affiliate_payouts')
        .select('amount, period, paid_at')
        .eq('affiliate_id', aff.id)
        .eq('payout_type', 'royalty')
      const rp = royaltyPayouts || []
      const lastMonthRow = rp.find((p) => p.period === lastPeriod)
      const oppGrossMtd = await sumOppGross(thisPeriod)
      royalty = {
        eligible: true,
        pct: ROYALTY_PCT,
        projected_mtd: Math.round((oppGrossMtd * ROYALTY_PCT) / 100 * 100) / 100,
        pending: rp.filter((p) => !p.paid_at).reduce((s, p) => s + Number(p.amount || 0), 0),
        lifetime_paid: rp.filter((p) => p.paid_at).reduce((s, p) => s + Number(p.amount || 0), 0),
        last_month: lastMonthRow ? Number(lastMonthRow.amount || 0) : 0,
        last_period: lastPeriod,
      }
    }

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
      funnel,
      royalty,
    })
  } catch (err) {
    console.error('Affiliate me error:', err)
    return res.status(500).json({ error: 'Internal error' })
  }
}
