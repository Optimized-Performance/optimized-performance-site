import { supabaseAdmin } from '../../../lib/supabase'
import { validateSessionToken } from '../../../lib/session'
import { validateOrigin, rateLimit } from '../../../lib/security'
import { commissionableTotal } from '../../../lib/commission'
import { ROYALTY_PCT } from '../../../lib/affiliate-config'

// Admin royalty tracker. Royalty = ROYALTY_PCT of OPP's commissionable gross
// (shipping-excluded, same basis the cron pays on), owed to flat-rate primaries
// (Tris). Returns the LIVE current-month projection (accruing) + per-period
// history cross-referenced against the actual royalty payouts so you can see
// paid / pending / not-yet-generated at a glance.

function requireAuth(req) {
  return validateSessionToken(req.headers['x-admin-token'])
}

function periodKeyOf(dateStr) {
  const d = new Date(dateStr)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
function currentPeriod() {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export default async function handler(req, res) {
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 60, windowMs: 60000 })) {
    return res.status(429).json({ error: 'Too many requests' })
  }
  if (!requireAuth(req)) return res.status(401).json({ error: 'Unauthorized' })
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    // OPP commissionable gross by period, from completed orders.
    const { data: orders, error: oErr } = await supabaseAdmin
      .from('orders')
      .select('total, shipping, created_at')
      .eq('payment_status', 'completed')
      .order('created_at', { ascending: false })
      .limit(10000)
    if (oErr) throw oErr
    const grossByPeriod = {}
    for (const o of orders || []) {
      const pk = periodKeyOf(o.created_at)
      grossByPeriod[pk] = (grossByPeriod[pk] || 0) + commissionableTotal(o)
    }

    // Actual royalty payouts (status per period).
    const { data: payouts, error: pErr } = await supabaseAdmin
      .from('affiliate_payouts')
      .select('period, amount, paid_at, affiliate:affiliates!affiliate_payouts_affiliate_id_fkey(code, name)')
      .eq('payout_type', 'royalty')
    if (pErr) throw pErr
    const payoutByPeriod = {}
    for (const p of payouts || []) payoutByPeriod[p.period] = p

    const cur = currentPeriod()
    const periods = Array.from(new Set([...Object.keys(grossByPeriod), ...Object.keys(payoutByPeriod), cur]))
      .sort()
      .reverse()

    const history = periods.map((pk) => {
      const gross = Math.round((grossByPeriod[pk] || 0) * 100) / 100
      const royalty = Math.round((gross * ROYALTY_PCT) / 100 * 100) / 100
      const payout = payoutByPeriod[pk]
      let status
      if (pk === cur) status = 'accruing'
      else if (payout) status = payout.paid_at ? 'paid' : 'pending'
      else status = 'not_generated' // past month with revenue but no royalty payout = cron miss
      return {
        period: pk,
        opp_gross: gross,
        royalty,
        payout_amount: payout ? Number(payout.amount || 0) : null,
        recipient: payout?.affiliate?.code || null,
        status,
      }
    })

    const projected = history.find((h) => h.period === cur) || { period: cur, opp_gross: 0, royalty: 0, status: 'accruing' }
    const lifetimePaid = history.filter((h) => h.status === 'paid').reduce((s, h) => s + (h.payout_amount ?? h.royalty), 0)
    const pending = history.filter((h) => h.status === 'pending').reduce((s, h) => s + (h.payout_amount ?? h.royalty), 0)

    return res.status(200).json({
      pct: ROYALTY_PCT,
      current_period: cur,
      projected,
      lifetime_paid: Math.round(lifetimePaid * 100) / 100,
      pending: Math.round(pending * 100) / 100,
      history,
    })
  } catch (e) {
    console.error('Admin royalty error:', e)
    return res.status(500).json({ error: 'Query failed' })
  }
}
