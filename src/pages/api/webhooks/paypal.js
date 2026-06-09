import { supabaseAdmin } from '../../../lib/supabase'
import { parsePaypalWebhookEvent, capturePaypalOrder } from '../../../lib/payments/paypalProcessor'
import { finalizePaidOrder } from '../../../lib/payments/finalizeOrder'

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

    // Stage 1: customer approved at paypal.com. Trigger the capture; PayPal
    // will then deliver PAYMENT.CAPTURE.COMPLETED, which is what finalizes
    // the order below. Recording the event before capture ensures duplicate
    // APPROVED deliveries don't double-capture.
    if (event.status === 'approved_pending_capture') {
      if (!event.eventId || !event.paypalOrderId) {
        return res.status(200).json({ received: true, action: 'no_capture_ref' })
      }
      const fresh = await recordEvent({ eventId: event.eventId, txId: event.paypalOrderId })
      if (!fresh) {
        return res.status(200).json({ received: true, action: 'replay_ignored' })
      }
      try {
        await capturePaypalOrder({ paypalOrderId: event.paypalOrderId })
      } catch (capErr) {
        console.error('[paypal-webhook] Capture failed:', capErr.message)
        return res.status(500).json({ error: capErr.message })
      }
      return res.status(200).json({ received: true, action: 'captured', order_number: event.orderNumber })
    }

    if (event.status === 'failed') {
      const { eventId, txId, orderNumber } = event
      if (eventId) await recordEvent({ eventId, txId }).catch(() => {})
      console.warn('[paypal-webhook] Capture denied/declined/voided for order:', orderNumber)
      return res.status(200).json({ received: true, action: 'failed', order_number: orderNumber })
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
