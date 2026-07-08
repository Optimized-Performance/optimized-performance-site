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
import { PAYMENT_STATUS, canTransitionPayment } from '../../../../lib/order-status'

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

    if (order.payment_status === PAYMENT_STATUS.REFUNDED) {
      return res.status(409).json({ error: 'Order is already marked refunded' })
    }

    const orderTotal = Number(order.total || 0)
    const alreadyRefunded = Number(order.refund_amount || 0)
    // Cap refunds against what was actually COLLECTED, not the order total — a
    // balance_due order (edited upward, balance unpaid) has collected less than
    // its total, and you can't refund money you never took. For a normal
    // completed order amount_paid === total, so this is unchanged. Fall back to
    // total for any pre-v31 order that never got an amount_paid written.
    const collected = Number(order.amount_paid || 0) || orderTotal

    // Default to refunding the OUTSTANDING collected balance (collected minus
    // anything already refunded), not the full total — so the default on a
    // partially-refunded order doesn't try to over-refund. Admin can pass less.
    const outstanding = Math.max(0, collected - alreadyRefunded)
    const refundAmount = Number(amount ?? outstanding ?? 0)
    if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
      return res.status(400).json({ error: 'Invalid refund amount' })
    }
    // Guard the CUMULATIVE total, not just this single refund. Prior code only
    // checked one refund against order.total, so two partial refunds could each
    // pass yet together exceed what the customer paid. Accumulate and cap.
    const cumulativeRefunded = alreadyRefunded + refundAmount
    if (cumulativeRefunded > collected + 0.01) {
      return res.status(400).json({
        error: `Refund exceeds amount collected. Already refunded $${alreadyRefunded.toFixed(2)} of $${collected.toFixed(2)} collected; max additional $${outstanding.toFixed(2)}.`,
      })
    }

    const refundReason = String(reason || '').slice(0, 500)
    const nowIso = new Date().toISOString()

    // Partial refunds (cumulative < total) leave the order open so it ships
    // normally — used when correcting an overcharge (e.g. sale-discount bug
    // fix, broken-item credit, shipping adjustment) without canceling
    // fulfillment. A refund that brings the CUMULATIVE total up to the order
    // total flips payment_status to 'refunded' and fulfillment_status to
    // 'cancelled'.
    const isFullRefund = cumulativeRefunded >= collected - 0.01

    const update = {
      refunded_at: nowIso,
      // Store the running total refunded, not just this call's amount, so the
      // accumulation guard above stays correct across multiple partial refunds.
      refund_amount: cumulativeRefunded,
      refund_reason: refundReason || null,
      refunded_by: 'admin',
      updated_at: nowIso,
    }
    if (isFullRefund) {
      // Guard the transition — refunding from a non-open/non-completed state
      // (e.g. already abandoned) is illegal; return a clean 409 rather than
      // writing an illegal transition. (fulfillment_status is a separate column
      // not modeled by the payment state machine.)
      if (!canTransitionPayment(order.payment_status, PAYMENT_STATUS.REFUNDED)) {
        return res.status(409).json({ error: `Cannot refund an order in "${order.payment_status}" state.` })
      }
      update.payment_status = PAYMENT_STATUS.REFUNDED
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
