import { validateAffiliateToken } from '../../../lib/affiliate-session'
import { supabaseAdmin } from '../../../lib/supabase'
import { rateLimit } from '../../../lib/security'
import { calcCommission } from '../../../lib/commission'

// GET /api/affiliates/payouts
//   Returns last 12 months of payouts for the authed affiliate (paid + pending),
//   plus any per-order commission summarized by month.
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
    const { data: aff, error: affErr } = await supabaseAdmin
      .from('affiliates')
      .select('id, code, active')
      .eq('id', session.affiliateId)
      .single()
    if (affErr || !aff) return res.status(404).json({ error: 'Affiliate not found' })
    if (!aff.active) return res.status(403).json({ error: 'Inactive' })

    // 12 months back from start of current month
    const now = new Date()
    const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, 1))

    // Cron-driven payouts (override / royalty / manual)
    const { data: payouts, error: pErr } = await supabaseAdmin
      .from('affiliate_payouts')
      .select('id, payout_type, period, amount, notes, paid_at, created_at, trigger_affiliate_id')
      .eq('affiliate_id', aff.id)
      .gte('created_at', cutoff.toISOString())
      .order('created_at', { ascending: false })
    if (pErr) throw pErr

    // Per-order volume + commission aggregated by month, using per-order snapshots
    // (orders.affiliate_commission_pct, captured at order-create time). Accurate to
    // the rate that was in effect when each order was placed.
    const { data: orders, error: oErr } = await supabaseAdmin
      .from('orders')
      .select('total, shipping, cogs, affiliate_commission_pct, created_at')
      .eq('affiliate_code', aff.code)
      .eq('payment_status', 'completed')
      .gte('created_at', cutoff.toISOString())
    if (oErr) throw oErr

    // Group by YYYY-MM
    const ordersByMonth = {}
    for (const o of orders || []) {
      const d = new Date(o.created_at)
      const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      if (!ordersByMonth[k]) ordersByMonth[k] = { volume: 0, orders: 0, commission: 0 }
      // Volume = gross sales; commission excludes shipping (see lib/commission).
      ordersByMonth[k].volume += Number(o.total || 0)
      ordersByMonth[k].orders += 1
      ordersByMonth[k].commission += calcCommission(o)
    }
    const monthlyVolume = Object.entries(ordersByMonth)
      .map(([period, v]) => ({
        period,
        volume: v.volume,
        orders: v.orders,
        commission: v.commission,
      }))
      .sort((a, b) => (a.period < b.period ? 1 : -1))

    return res.status(200).json({
      payouts: payouts || [],
      monthly_volume: monthlyVolume,
    })
  } catch (err) {
    console.error('Payouts endpoint error:', err)
    return res.status(500).json({ error: 'Internal error' })
  }
}
