// Refund + cancel an order. Records the OPP-side bookkeeping (payment_status,
// fulfillment_status, refund metadata) and sends the customer a refund
// notification email.
//
// v1 does NOT call the Bankful refund API automatically — admin processes the
// refund via Bankful's dashboard separately. v1.1 will wire the API call once
// Diana confirms the Bankful refund endpoint shape. The audit row created
// here is the source of truth for accounting + chargeback defense regardless.
//
// Why a dedicated endpoint instead of overloading PATCH /api/admin/orders:
//   - Refund is a meaningfully different state transition (touches
//     payment_status, not just fulfillment_status)
//   - Customer notification email fires from this code path only
//   - Audit columns (refund_amount, refund_reason, refunded_by) are
//     refund-specific and belong at the same write site

import { supabaseAdmin } from '../../../../lib/supabase'
import { validateSessionToken } from '../../../../lib/session'
import { validateOrigin, rateLimit } from '../../../../lib/security'
import { sendRefundNotification } from '../../../../lib/alerts'

function requireAuth(req) {
  const token = req.headers['x-admin-token']
  return validateSessionToken(token)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 30, windowMs: 60000 })) {
    return res.status(429).json({ error: 'Too many requests' })
  }
  if (!requireAuth(req)) return res.status(401).json({ error: 'Unauthorized' })
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  try {
    const { id, amount, reason } = req.body || {}
    if (!id) return res.status(400).json({ error: 'Missing order id' })

    const { data: order, error: fetchErr } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', id)
      .single()
    if (fetchErr || !order) return res.status(404).json({ error: 'Order not found' })

    if (order.payment_status === 'refunded') {
      return res.status(409).json({ error: 'Order is already marked refunded' })
    }

    // Default to full refund of order.total. Admin can pass a smaller amount
    // for partial refunds. Disallow exceeding the original total.
    const refundAmount = Number(amount ?? order.total ?? 0)
    if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
      return res.status(400).json({ error: 'Invalid refund amount' })
    }
    if (refundAmount > Number(order.total || 0) + 0.01) {
      return res.status(400).json({ error: 'Refund amount exceeds order total' })
    }

    const refundReason = String(reason || '').slice(0, 500)
    const nowIso = new Date().toISOString()

    // Partial refunds (refund_amount < total) leave the order open so it
    // ships normally — used when correcting an overcharge (e.g. sale-discount
    // bug fix, broken-item credit, shipping adjustment) without canceling
    // fulfillment. Full refunds flip payment_status to 'refunded' and
    // fulfillment_status to 'cancelled' as before.
    const orderTotal = Number(order.total || 0)
    const isFullRefund = refundAmount >= orderTotal - 0.01

    const update = {
      refunded_at: nowIso,
      refund_amount: refundAmount,
      refund_reason: refundReason || null,
      refunded_by: 'admin',
      updated_at: nowIso,
    }
    if (isFullRefund) {
      update.payment_status = 'refunded'
      update.fulfillment_status = 'cancelled'
    }
    // For partial refunds, payment_status stays at its current value (likely
    // 'completed') and fulfillment_status is untouched so the admin Pending
    // / Packed / Shipped pipeline continues normally.

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('orders')
      .update(update)
      .eq('id', id)
      .select()
      .single()
    if (updateErr) throw updateErr

    // Fire the customer email AFTER the DB commits so a SendGrid hiccup
    // doesn't roll back the refund record. Failures log but don't block.
    sendRefundNotification(updated, { amount: refundAmount, reason: refundReason }).catch((e) => {
      console.error('[orders/refund] sendRefundNotification failed:', e)
    })

    return res.status(200).json({
      ok: true,
      order: updated,
      // Reminder to the admin UI — surfaced in the success toast.
      bankful_action_required:
        'OPP record updated and customer notified. Process the actual refund via Bankful dashboard if not already done.',
    })
  } catch (err) {
    console.error('[orders/refund] Error:', err)
    return res.status(500).json({ error: err.message })
  }
}
