import { supabaseAdmin } from '../../../../lib/supabase'
import { validateSessionToken } from '../../../../lib/session'
import { validateOrigin, rateLimit } from '../../../../lib/security'
import { buyLabelForOrder } from '../../../../lib/shippo'

// Buy a Shippo shipping label for one order (admin). Stamps tracking +
// label_url/label_cost (migration v35) on success; the tracking stamp is the
// hard requirement, the label columns degrade soft if v35 hasn't run.
//
// POST { order_number, force? } → { ok, tracking_number, label_url, cost, service }
// 409 if the order already has tracking (pass force=true to re-buy — e.g. a
// voided label; the admin owns voiding the old one in Shippo).

function requireAuth(req) {
  return validateSessionToken(req.headers['x-admin-token'])
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 20, windowMs: 60000 })) {
    return res.status(429).json({ error: 'Too many requests' })
  }
  if (!requireAuth(req)) return res.status(401).json({ error: 'Unauthorized' })
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  const { order_number: orderNumber, force } = req.body || {}
  if (!orderNumber || typeof orderNumber !== 'string') {
    return res.status(400).json({ error: 'order_number required' })
  }

  try {
    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('order_number', orderNumber)
      .maybeSingle()
    if (error) throw error
    if (!order) return res.status(404).json({ error: 'Order not found' })

    if (order.payment_status !== 'completed' && order.payment_status !== 'balance_due') {
      return res.status(400).json({ error: `Order is ${order.payment_status} — labels are for paid orders.` })
    }
    if ((order.fulfillment_status || 'pending') === 'cancelled') {
      return res.status(400).json({ error: 'Order is cancelled.' })
    }
    if (order.fraud_status === 'blocked') {
      return res.status(400).json({ error: 'Order is fraud-blocked — clear it before shipping.' })
    }
    if (order.tracking && !force) {
      return res.status(409).json({ error: `Order already has tracking ${order.tracking}. Re-buy with force after voiding the old label in Shippo.` })
    }

    const label = await buyLabelForOrder(order)
    if (!label.ok) {
      return res.status(502).json({ error: label.error || label.reason, reason: label.reason })
    }

    // Stamp tracking (required) + label columns (soft — v35 may not be run).
    const stamp = {
      tracking: label.trackingNumber,
      label_url: label.labelUrl,
      label_cost: label.cost,
      updated_at: new Date().toISOString(),
    }
    let { error: upErr } = await supabaseAdmin.from('orders').update(stamp).eq('id', order.id)
    if (upErr && /label_url|label_cost/i.test(upErr.message || '')) {
      ;({ error: upErr } = await supabaseAdmin
        .from('orders')
        .update({ tracking: label.trackingNumber, updated_at: stamp.updated_at })
        .eq('id', order.id))
    }
    if (upErr) {
      // Label WAS purchased — surface everything so the admin can stamp manually.
      return res.status(200).json({
        ok: true,
        warning: `Label bought but the order update failed (${upErr.message}) — paste the tracking in manually.`,
        tracking_number: label.trackingNumber,
        label_url: label.labelUrl,
        cost: label.cost,
        service: label.service,
      })
    }

    return res.status(200).json({
      ok: true,
      tracking_number: label.trackingNumber,
      label_url: label.labelUrl,
      cost: label.cost,
      service: label.service,
    })
  } catch (err) {
    console.error('[shippo-label]', err)
    return res.status(500).json({ error: err.message })
  }
}
