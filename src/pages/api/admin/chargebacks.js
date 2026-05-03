import { supabaseAdmin } from '../../../lib/supabase'
import { validateSessionToken } from '../../../lib/session'
import { validateOrigin, rateLimit } from '../../../lib/security'

const ALLOWED_STATUS = ['open', 'responded', 'won', 'lost', 'withdrawn']
const ALLOWED_REASON = ['fraud', 'not_received', 'not_as_described', 'duplicate', 'technical', 'other']
const ALLOWED_PROCESSOR = ['bankful', 'elite', 'moonpay', 'other']

function requireAuth(req) {
  return validateSessionToken(req.headers['x-admin-token'])
}

export default async function handler(req, res) {
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 60, windowMs: 60000 })) {
    return res.status(429).json({ error: 'Too many requests' })
  }
  if (!requireAuth(req)) return res.status(401).json({ error: 'Unauthorized' })
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  try {
    if (req.method === 'GET') {
      const { stats, status, processor, since, limit = '500' } = req.query

      // Stats branch — returns ratio + counts for the dashboard
      if (stats === '1') {
        return res.status(200).json(await computeStats())
      }

      let q = supabaseAdmin
        .from('chargebacks')
        .select('*')
        .order('filed_at', { ascending: false })
        .limit(Math.min(Number(limit) || 500, 2000))
      if (status) q = q.eq('status', String(status))
      if (processor) q = q.eq('processor', String(processor))
      if (since) q = q.gte('filed_at', String(since))

      const { data, error } = await q
      if (error) throw error
      return res.status(200).json(data || [])
    }

    if (req.method === 'POST') {
      const {
        order_id, order_number, reason_category, network_reason_code,
        amount, filed_at, response_due_at, processor, processor_case_id,
        customer_email, notes,
      } = req.body || {}

      if (!reason_category || !ALLOWED_REASON.includes(reason_category)) {
        return res.status(400).json({ error: 'Invalid reason_category' })
      }
      if (amount === undefined) return res.status(400).json({ error: 'Missing amount' })
      const amt = Number(amount)
      if (!Number.isFinite(amt) || amt < 0 || amt > 100000) {
        return res.status(400).json({ error: 'Invalid amount' })
      }
      const proc = processor || 'bankful'
      if (!ALLOWED_PROCESSOR.includes(proc)) {
        return res.status(400).json({ error: 'Invalid processor' })
      }

      const insert = {
        order_id: order_id || null,
        order_number: order_number || null,
        reason_category,
        network_reason_code: network_reason_code || null,
        amount: amt,
        filed_at: filed_at || new Date().toISOString(),
        response_due_at: response_due_at || null,
        processor: proc,
        processor_case_id: processor_case_id || null,
        customer_email: customer_email || null,
        notes: notes || null,
      }

      const { data, error } = await supabaseAdmin
        .from('chargebacks')
        .insert(insert)
        .select()
        .single()
      if (error) throw error
      return res.status(200).json(data)
    }

    if (req.method === 'PATCH') {
      const { id, status, network_reason_code, response_due_at, processor_case_id, notes } = req.body || {}
      if (!id) return res.status(400).json({ error: 'Missing id' })

      const patch = { updated_at: new Date().toISOString() }
      if (status !== undefined) {
        if (!ALLOWED_STATUS.includes(status)) {
          return res.status(400).json({ error: 'Invalid status' })
        }
        patch.status = status
        if (['won', 'lost', 'withdrawn'].includes(status)) {
          patch.resolved_at = new Date().toISOString()
        } else if (status === 'open' || status === 'responded') {
          patch.resolved_at = null
        }
      }
      if (network_reason_code !== undefined) patch.network_reason_code = network_reason_code
      if (response_due_at !== undefined) patch.response_due_at = response_due_at
      if (processor_case_id !== undefined) patch.processor_case_id = processor_case_id
      if (notes !== undefined) patch.notes = notes

      const { data, error } = await supabaseAdmin
        .from('chargebacks')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return res.status(200).json(data)
    }

    if (req.method === 'DELETE') {
      const { id } = req.query
      if (!id) return res.status(400).json({ error: 'Missing id' })
      const { error } = await supabaseAdmin.from('chargebacks').delete().eq('id', id)
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    return res.status(405).end()
  } catch (err) {
    console.error('Admin chargebacks error:', err)
    return res.status(500).json({ error: err.message })
  }
}

// Compute chargeback ratio for current month + trailing 90 days, plus
// open/won/lost counts. Used by the admin Chargebacks tab top-of-page strip.
async function computeStats() {
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()

  // Period chargebacks
  const [monthCb, t90Cb] = await Promise.all([
    supabaseAdmin.from('chargebacks').select('amount, status').gte('filed_at', monthStart),
    supabaseAdmin.from('chargebacks').select('amount, status').gte('filed_at', ninetyDaysAgo),
  ])

  // Period orders (denominator) — only completed payments count toward the ratio
  const [monthOrders, t90Orders] = await Promise.all([
    supabaseAdmin.from('orders').select('id', { count: 'exact', head: true })
      .eq('payment_status', 'completed').gte('created_at', monthStart),
    supabaseAdmin.from('orders').select('id', { count: 'exact', head: true })
      .eq('payment_status', 'completed').gte('created_at', ninetyDaysAgo),
  ])

  const monthCbCount = (monthCb.data || []).length
  const t90CbCount = (t90Cb.data || []).length
  const monthOrderCount = monthOrders.count || 0
  const t90OrderCount = t90Orders.count || 0

  const ratio = (cb, total) => (total > 0 ? cb / total : 0)

  // Open / response-due metrics
  const { data: openList } = await supabaseAdmin
    .from('chargebacks')
    .select('id, response_due_at')
    .in('status', ['open', 'responded'])

  const now2 = Date.now()
  const responseDueSoon = (openList || []).filter((c) => {
    if (!c.response_due_at) return false
    const diff = new Date(c.response_due_at).getTime() - now2
    return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000  // < 3 days
  }).length
  const responseOverdue = (openList || []).filter((c) => {
    if (!c.response_due_at) return false
    return new Date(c.response_due_at).getTime() < now2
  }).length

  return {
    month: {
      chargebacks: monthCbCount,
      orders: monthOrderCount,
      ratio: ratio(monthCbCount, monthOrderCount),
      amount: (monthCb.data || []).reduce((s, c) => s + Number(c.amount || 0), 0),
    },
    trailing_90d: {
      chargebacks: t90CbCount,
      orders: t90OrderCount,
      ratio: ratio(t90CbCount, t90OrderCount),
      amount: (t90Cb.data || []).reduce((s, c) => s + Number(c.amount || 0), 0),
    },
    open: (openList || []).length,
    response_due_soon: responseDueSoon,
    response_overdue: responseOverdue,
  }
}
