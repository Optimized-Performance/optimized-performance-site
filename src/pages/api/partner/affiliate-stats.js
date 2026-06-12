import crypto from 'crypto'
import { supabaseAdmin } from '../../../lib/supabase'

// POST /api/partner/affiliate-stats  { codes: ["TRIS", ...] }
// Header: x-partner-secret = PARTNER_STATS_SECRET
//
// Read-only order stats per affiliate code for the Forged Coaching founder
// dashboard (cross-app: the coaching app maps coaches -> their OPP codes and
// shows conversions/revenue next to engagement metrics). Returns ONLY
// aggregate counts/revenue — no customer data leaves this app.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const secret = process.env.PARTNER_STATS_SECRET
  if (!secret) return res.status(503).json({ error: 'Partner stats not configured' })
  const provided = String(req.headers['x-partner-secret'] || '')
  const a = Buffer.from(provided)
  const b = Buffer.from(secret)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const codes = Array.isArray(req.body?.codes)
    ? [...new Set(req.body.codes.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean))].slice(0, 100)
    : []
  if (!codes.length) return res.status(200).json({ stats: {} })

  const since30 = new Date(Date.now() - 30 * 86400000).toISOString()
  const db = supabaseAdmin()
  const { data: orders, error } = await db
    .from('orders')
    .select('affiliate_code, total, created_at')
    .in('affiliate_code', codes)
    .eq('payment_status', 'completed')
  if (error) {
    console.error('[partner/affiliate-stats] query failed', error)
    return res.status(500).json({ error: 'Query failed' })
  }

  const stats = {}
  for (const c of codes) stats[c] = { orders_30d: 0, revenue_30d: 0, orders_total: 0, revenue_total: 0 }
  for (const o of orders || []) {
    const s = stats[String(o.affiliate_code || '').toUpperCase()]
    if (!s) continue
    const t = Number(o.total) || 0
    s.orders_total += 1
    s.revenue_total += t
    if (o.created_at >= since30) { s.orders_30d += 1; s.revenue_30d += t }
  }
  for (const c of codes) {
    stats[c].revenue_30d = Math.round(stats[c].revenue_30d * 100) / 100
    stats[c].revenue_total = Math.round(stats[c].revenue_total * 100) / 100
  }

  return res.status(200).json({ stats })
}
