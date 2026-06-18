import { validateAffiliateToken } from '../../../lib/affiliate-session'
import { supabaseAdmin } from '../../../lib/supabase'
import { rateLimit } from '../../../lib/security'
import { calcCommission, commissionableTotal } from '../../../lib/commission'
import { ROYALTY_PCT } from '../../../lib/affiliate-config'
import { getCatalog } from '../../../lib/catalog'

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
// shouldn't happen, but defensive). `codes` is an array so one affiliate's
// multiple codes (primary + linked secondary codes) aggregate in one query.
async function sumOrdersWithCommission(codes, start, end) {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('total, shipping, affiliate_commission_pct')
    .in('affiliate_code', codes)
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

async function sumPeriod(codes, periodKey) {
  const { start, end } = periodRange(periodKey)
  return sumOrdersWithCommission(codes, start, end)
}

async function sumYtd(codes) {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString()
  const end = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1)).toISOString()
  return sumOrdersWithCommission(codes, start, end)
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
async function affiliateFunnel(codes) {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('payment_status, payment_method')
    .in('affiliate_code', codes)
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

// Top-selling products for one affiliate (lifetime, completed orders).
// Aggregates units + gross revenue per product and allocates each order's
// ACTUAL commission across its lines by gross-value share — so per-item
// earnings sum back to the commission the affiliate was really paid (calcCommission),
// and the rule in lib/commission can't drift here. Revenue is reported GROSS
// (retail line value) to match how volume is reported elsewhere; only the
// allocated earnings exclude shipping/discount (they inherit it from the
// order-level commission). Returns the top 3 by units sold.
async function topItemsSold(codes) {
  const products = await getCatalog()
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('items, total, shipping, affiliate_commission_pct')
    .in('affiliate_code', codes)
    .eq('payment_status', 'completed')
  if (error) throw error
  const byKey = new Map()
  for (const o of data || []) {
    const lines = Array.isArray(o.items) ? o.items : []
    // Price each line from stored per-line price (cart value at order time),
    // falling back to the live catalog price if a stored line lacks one.
    const priced = lines.map((it) => {
      const prod = products.find((p) => p.sku === it.sku || p.id === it.id)
      const qty = Number(it.quantity || 0)
      const price = Number(it.price ?? prod?.price ?? 0)
      const key = it.sku || it.id || it.name || 'unknown'
      const name = prod?.name || it.name || key
      return { key, name, qty, gross: price * qty }
    })
    const lineSubtotal = priced.reduce((s, p) => s + p.gross, 0)
    const orderCommission = calcCommission(o)
    for (const p of priced) {
      if (p.qty <= 0) continue
      const earn = lineSubtotal > 0 ? orderCommission * (p.gross / lineSubtotal) : 0
      const cur = byKey.get(p.key) || { key: p.key, name: p.name, units: 0, revenue: 0, earnings: 0 }
      cur.units += p.qty
      cur.revenue += p.gross
      cur.earnings += earn
      byKey.set(p.key, cur)
    }
  }
  return Array.from(byKey.values())
    .map((r) => ({
      ...r,
      revenue: Math.round(r.revenue * 100) / 100,
      earnings: Math.round(r.earnings * 100) / 100,
    }))
    .sort((a, b) => b.units - a.units || b.earnings - a.earnings)
    .slice(0, 3)
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
    // The columns we want, including the v28 linking column. Select with a
    // fallback so a deploy that lands BEFORE migration v28 still works (the
    // feature is simply inert — no linked codes — until the column exists).
    const FULL_COLS = 'id, code, name, email, commission_pct, discount_pct, active, parent_affiliate_id, is_flat_rate, recruiter_override_pct, owner_affiliate_id, code_label, total_sales, total_revenue, total_commission, created_at'
    const BASE_COLS = 'id, code, name, email, commission_pct, discount_pct, active, parent_affiliate_id, is_flat_rate, recruiter_override_pct, total_sales, total_revenue, total_commission, created_at'

    async function loadAffiliate(id) {
      let { data, error } = await supabaseAdmin.from('affiliates').select(FULL_COLS).eq('id', id).single()
      if (error && /owner_affiliate_id|code_label/.test(error.message || '')) {
        ;({ data, error } = await supabaseAdmin.from('affiliates').select(BASE_COLS).eq('id', id).single())
      }
      return { data, error }
    }

    // The row the token belongs to. If they somehow logged into a secondary
    // code, resolve up to its owner so the dashboard always centers on the
    // primary (the row that aggregates the person's codes).
    let { data: loginRow, error: affErr } = await loadAffiliate(session.affiliateId)
    if (affErr || !loginRow) return res.status(404).json({ error: 'Affiliate not found' })
    let aff = loginRow
    if (loginRow.owner_affiliate_id) {
      const owner = await loadAffiliate(loginRow.owner_affiliate_id)
      if (owner.data) aff = owner.data
    }
    if (!aff.active) return res.status(403).json({ error: 'Affiliate account is inactive' })

    // Secondary codes linked to this primary (same person, different split).
    // Empty when the v28 column is absent or the person has only one code.
    let linkedCodes = []
    {
      const { data: linked } = await supabaseAdmin
        .from('affiliates')
        .select('id, code, code_label, discount_pct, commission_pct, active, total_sales, total_revenue, total_commission, created_at')
        .eq('owner_affiliate_id', aff.id)
        .order('created_at', { ascending: true })
      linkedCodes = linked || []
    }

    // All of this person's codes (primary first), and all their affiliate ids
    // for payout aggregation. Headline stats, funnel and top-items all span
    // every code; the per-code breakdown is the only place they're separated.
    const allRows = [aff, ...linkedCodes]
    const allCodes = allRows.map((r) => r.code)
    const allIds = allRows.map((r) => r.id)

    // MTD + last-month + YTD volume + actual commission (from per-order snapshots)
    const thisPeriod = periodKey()
    const lastPeriod = previousPeriodKey()
    const [mtd, lastMonth, ytd] = await Promise.all([
      sumPeriod(allCodes, thisPeriod),
      sumPeriod(allCodes, lastPeriod),
      sumYtd(allCodes),
    ])

    // Per-code breakdown (only meaningful when >1 code, but always computed so
    // the client can render it uniformly). Lifetime per code from the row's
    // maintained totals; MTD per code from a fresh sum.
    const codes = await Promise.all(allRows.map(async (r) => {
      const codeMtd = await sumPeriod([r.code], thisPeriod)
      return {
        code: r.code,
        label: r.code_label || (r.id === aff.id ? 'Main' : r.code),
        is_primary: r.id === aff.id,
        active: r.active !== false,
        discount_pct: Number(r.discount_pct || 0),
        commission_pct: Number(r.commission_pct || 0),
        mtd_volume: codeMtd.total,
        mtd_orders: codeMtd.count,
        mtd_commission: codeMtd.commission,
        lifetime_volume: Number(r.total_revenue || 0),
        lifetime_orders: Number(r.total_sales || 0),
        lifetime_commission: Number(r.total_commission || 0),
      }
    }))

    // Pending payouts (paid_at IS NULL) — across all of this person's codes.
    const { data: pendingPayouts, error: payErr } = await supabaseAdmin
      .from('affiliate_payouts')
      .select('id, payout_type, period, amount, notes, created_at')
      .in('affiliate_id', allIds)
      .is('paid_at', null)
      .order('created_at', { ascending: false })
    if (payErr) throw payErr

    const pendingTotal = (pendingPayouts || []).reduce((s, p) => s + Number(p.amount || 0), 0)

    // YTD payouts processed (cron-driven payouts created this year — overrides + royalties)
    const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)).toISOString()
    const { data: ytdPayouts } = await supabaseAdmin
      .from('affiliate_payouts')
      .select('amount, payout_type')
      .in('affiliate_id', allIds)
      .gte('created_at', yearStart)
    const ytdPayoutsTotal = (ytdPayouts || []).reduce((s, p) => s + Number(p.amount || 0), 0)

    // Whether they have a network they can recruit into
    const hasNetwork = Number(aff.recruiter_override_pct || 0) > 0

    // Payment funnel + top sellers across all of this person's codes
    const funnel = await affiliateFunnel(allCodes)
    const topItems = await topItemsSold(allCodes)

    // Combined lifetime across all codes (each row maintains its own totals)
    const lifetime = allRows.reduce((acc, r) => ({
      volume: acc.volume + Number(r.total_revenue || 0),
      orders: acc.orders + Number(r.total_sales || 0),
      commission: acc.commission + Number(r.total_commission || 0),
    }), { volume: 0, orders: 0, commission: 0 })

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
        lifetime_volume: lifetime.volume,
        lifetime_orders: lifetime.orders,
        lifetime_commission: lifetime.commission,
      },
      // Per-code breakdown. Always present; the dashboard renders the section
      // only when there's more than one code.
      codes,
      pending_payouts: pendingPayouts || [],
      pending_total: pendingTotal,
      funnel,
      top_items: topItems,
      royalty,
    })
  } catch (err) {
    console.error('Affiliate me error:', err)
    return res.status(500).json({ error: 'Internal error' })
  }
}
