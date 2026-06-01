import { validateAffiliateToken } from '../../../lib/affiliate-session'
import { supabaseAdmin } from '../../../lib/supabase'
import { rateLimit } from '../../../lib/security'
import { commissionableTotal } from '../../../lib/commission'

function periodKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function periodRange(pk) {
  const [y, m] = pk.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, 1))
  const end = new Date(Date.UTC(y, m, 1))
  return { start: start.toISOString(), end: end.toISOString() }
}

async function sumOrders(code, pk) {
  const { start, end } = periodRange(pk)
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('total, shipping')
    .eq('affiliate_code', code)
    .eq('payment_status', 'completed')
    .gte('created_at', start)
    .lt('created_at', end)
  if (error) throw error
  return {
    // total = gross sales (volume display); commissionable = shipping excluded,
    // used for the override projection so it matches the cron's actual payout.
    total: (data || []).reduce((s, o) => s + Number(o.total || 0), 0),
    commissionable: (data || []).reduce((s, o) => s + commissionableTotal(o), 0),
    count: (data || []).length,
  }
}

// GET /api/affiliates/network
//   Lists this affiliate's recruits with their MTD volume + tier + projected override.
//   Authorization: caller must have recruiter_override_pct > 0 (i.e., they're allowed to recruit).
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  if (!rateLimit(req, { maxRequests: 30, windowMs: 60000 })) {
    return res.status(429).json({ error: 'Too many requests' })
  }

  const token = req.headers['x-affiliate-token']
  const session = validateAffiliateToken(token)
  if (!session) return res.status(401).json({ error: 'Invalid or expired token' })

  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  try {
    // Caller must have recruiter_override_pct > 0
    const { data: caller, error: callerErr } = await supabaseAdmin
      .from('affiliates')
      .select('id, recruiter_override_pct, active')
      .eq('id', session.affiliateId)
      .single()
    if (callerErr || !caller) return res.status(404).json({ error: 'Affiliate not found' })
    if (!caller.active) return res.status(403).json({ error: 'Inactive' })
    const overridePct = Number(caller.recruiter_override_pct || 0)
    if (overridePct <= 0) return res.status(403).json({ error: 'No network access' })

    // Recruits
    const { data: recruits, error: recErr } = await supabaseAdmin
      .from('affiliates')
      .select('id, code, name, email, commission_pct, active, total_sales, total_revenue, created_at')
      .eq('parent_affiliate_id', caller.id)
      .order('created_at', { ascending: false })
    if (recErr) throw recErr

    const thisPeriod = periodKey()

    // Compute MTD volume per recruit + projected override
    const enriched = await Promise.all((recruits || []).map(async (r) => {
      const mtd = await sumOrders(r.code, thisPeriod)
      const projectedOverride = (mtd.commissionable * overridePct) / 100
      return {
        id: r.id,
        code: r.code,
        name: r.name,
        active: r.active,
        commission_pct: Number(r.commission_pct || 0),
        member_since: r.created_at,
        mtd_volume: mtd.total,
        mtd_orders: mtd.count,
        mtd_projected_override: projectedOverride,
        lifetime_volume: Number(r.total_revenue || 0),
        lifetime_orders: Number(r.total_sales || 0),
      }
    }))

    // Total override paid (lifetime)
    const { data: overridePayouts, error: ovErr } = await supabaseAdmin
      .from('affiliate_payouts')
      .select('amount, paid_at')
      .eq('affiliate_id', caller.id)
      .eq('payout_type', 'override')
    if (ovErr) throw ovErr

    const lifetimeOverridePaid = (overridePayouts || [])
      .filter((p) => p.paid_at)
      .reduce((s, p) => s + Number(p.amount || 0), 0)
    const lifetimeOverridePending = (overridePayouts || [])
      .filter((p) => !p.paid_at)
      .reduce((s, p) => s + Number(p.amount || 0), 0)

    return res.status(200).json({
      override_pct: overridePct,
      recruit_count: enriched.length,
      mtd_recruit_volume: enriched.reduce((s, r) => s + r.mtd_volume, 0),
      mtd_projected_override_total: enriched.reduce((s, r) => s + r.mtd_projected_override, 0),
      lifetime_override_paid: lifetimeOverridePaid,
      lifetime_override_pending: lifetimeOverridePending,
      recruits: enriched,
    })
  } catch (err) {
    console.error('Network endpoint error:', err)
    return res.status(500).json({ error: 'Internal error' })
  }
}
