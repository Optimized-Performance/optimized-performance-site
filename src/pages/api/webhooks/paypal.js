import { supabaseAdmin } from '../../../lib/supabase'
import { parsePaypalWebhookEvent, capturePaypalOrder } from '../../../lib/payments/paypalProcessor'
import { finalizePaidOrder } from '../../../lib/payments/finalizeOrder'
import { PAYMENT_STATUS, canTransitionPayment } from '../../../lib/order-status'

export const config = {
  api: { bodyParser: false },
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => { data += chunk })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

// Idempotency helper — same shape as the bankful/nowpayments handlers.
// Returns true if this is the first time we've seen the event.
async function recordEvent({ eventId, txId }) {
  const { error } = await supabaseAdmin
    .from('webhook_events')
    .insert({ provider: 'paypal', event_id: eventId, tx_id: txId || null })
  if (error && error.code === '23505') return false
  if (error) throw error
  return true
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const rawBody = await readRawBody(req)
    const event = await parsePaypalWebhookEvent({ rawBody, headers: req.headers })

    if (!event.verified) {
      console.error('[paypal-webhook] Verification failed:', event.reason)
      return res.status(401).json({ error: event.reason })
    }

    if (event.ignore) {
      return res.status(200).json({ received: true, action: 'ignored', reason: event.reason })
    }

    // Stage 1: customer approved at paypal.com. Trigger the capture AND
    // finalize right here off the capture response — do NOT depend solely on
    // the separate PAYMENT.CAPTURE.COMPLETED webhook, which can be delayed or
    // lost and would leave a genuinely-paid order sitting awaiting_payment
    // until the expire cron abandons it. finalizePaidOrder is idempotent (it
    // only acts on OPEN-state orders), so if COMPLETED arrives later it just
    // no-ops. Recording the event before capture ensures duplicate APPROVED
    // deliveries don't double-capture.
    if (event.status === 'approved_pending_capture') {
      if (!event.eventId || !event.paypalOrderId) {
        return res.status(200).json({ received: true, action: 'no_capture_ref' })
      }
      const fresh = await recordEvent({ eventId: event.eventId, txId: event.paypalOrderId })
      if (!fresh) {
        return res.status(200).json({ received: true, action: 'replay_ignored' })
      }
      let capResult
      try {
        capResult = await capturePaypalOrder({ paypalOrderId: event.paypalOrderId })
      } catch (capErr) {
        console.error('[paypal-webhook] Capture failed:', capErr.message)
        return res.status(500).json({ error: capErr.message })
      }
      // Finalize immediately. capResult carries our order number + the captured
      // amount/currency (absent only on the already-captured 422 path, where a
      // prior capture's COMPLETED webhook handles reconciliation).
      const finalizeOrderNumber = capResult?.orderNumber || event.orderNumber
      if (finalizeOrderNumber) {
        try {
          const fin = await finalizePaidOrder({
            orderNumber: finalizeOrderNumber,
            paidAmount: capResult?.amount ?? null,
            paidCurrency: capResult?.currency ?? null,
          })
          if (!fin.ok && fin.reason !== 'order_not_found') {
            console.error('[paypal-webhook] Finalize-on-capture failed:', fin.reason, fin.error)
          }
        } catch (finErr) {
          // Don't fail the capture over a finalize hiccup — the COMPLETED
          // webhook is still the backup. Log loudly.
          console.error('[paypal-webhook] Finalize-on-capture threw (COMPLETED webhook will retry):', finErr.message)
        }
      }
      return res.status(200).json({ received: true, action: 'captured', order_number: finalizeOrderNumber })
    }

    if (event.status === 'failed') {
      const { eventId, txId, orderNumber } = event
      if (eventId) await recordEvent({ eventId, txId }).catch(() => {})
      console.warn('[paypal-webhook] Capture denied/declined/voided for order:', orderNumber)
      return res.status(200).json({ received: true, action: 'failed', order_number: orderNumber })
    }

    // Money leaving us: dashboard refund or capture reversal/chargeback. Flip
    // the order to refunded + cancel fulfillment so it can't ship. Only acts
    // when PayPal handed us our order number (custom_id) and the transition is
    // legal; otherwise log loudly for manual reconciliation.
    if (event.status === 'refunded') {
      const { eventId, txId, orderNumber, reason } = event
      if (eventId) await recordEvent({ eventId, txId }).catch(() => {})
      if (!orderNumber) {
        console.error('[paypal-webhook] REFUND/REVERSAL with no order ref — RECONCILE MANUALLY:', reason, txId)
        return res.status(200).json({ received: true, action: 'refund_no_order_ref' })
      }
      const { data: ord } = await supabaseAdmin
        .from('orders')
        .select('id, payment_status')
        .eq('order_number', orderNumber)
        .single()
      if (!ord) {
        console.error('[paypal-webhook] REFUND/REVERSAL order not found — RECONCILE MANUALLY:', orderNumber)
        return res.status(200).json({ received: true, action: 'refund_order_not_found' })
      }
      if (!canTransitionPayment(ord.payment_status, PAYMENT_STATUS.REFUNDED)) {
        // Already refunded, or terminal — nothing to do.
        return res.status(200).json({ received: true, action: 'refund_noop', order_number: orderNumber })
      }
      const nowIso = new Date().toISOString()
      await supabaseAdmin
        .from('orders')
        .update({
          payment_status: PAYMENT_STATUS.REFUNDED,
          fulfillment_status: 'cancelled',
          refunded_at: nowIso,
          refunded_by: 'paypal_webhook',
          refund_reason: reason || 'PayPal refund/reversal',
          updated_at: nowIso,
        })
        .eq('id', ord.id)
      console.warn('[paypal-webhook] Order marked refunded via', reason, '-', orderNumber)
      return res.status(200).json({ received: true, action: 'refunded', order_number: orderNumber })
    }

    if (event.status !== 'completed') {
      return res.status(200).json({ received: true, action: 'noop', status: event.status })
    }

    const { eventId, txId, orderNumber, amount, currency } = event
    if (!eventId || !orderNumber) {
      console.error('[paypal-webhook] Missing eventId or orderNumber on parsed event')
      return res.status(200).json({ received: true, action: 'no_order_ref' })
    }

    const fresh = await recordEvent({ eventId, txId })
    if (!fresh) {
      console.warn('[paypal-webhook] Replay detected, ignoring:', eventId)
      return res.status(200).json({ received: true, action: 'replay_ignored' })
    }

    const result = await finalizePaidOrder({ orderNumber, paidAmount: amount, paidCurrency: currency })
    if (!result.ok) {
      if (result.reason === 'order_not_found') {
        console.error('[paypal-webhook] Order not found for:', orderNumber)
        return res.status(200).json({ received: true, action: 'order_not_found' })
      }
      console.error('[paypal-webhook] Finalize failed:', result.reason, result.error)
      return res.status(500).json({ error: result.error?.message || result.reason })
    }

    return res.status(200).json({ received: true, action: 'order_completed', order_number: orderNumber })
  } catch (err) {
    console.error('[paypal-webhook] Error:', err)
    return res.status(500).json({ error: err.message })
  }
}
