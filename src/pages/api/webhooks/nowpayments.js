import { supabaseAdmin } from '../../../lib/supabase'
import { parseCryptoWebhookEvent } from '../../../lib/payments/cryptoProcessor'
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const rawBody = await readRawBody(req)
    const event = await parseCryptoWebhookEvent({ rawBody, headers: req.headers })

    if (!event.verified) {
      console.error('[nowpayments-webhook] Verification failed:', event.reason)
      return res.status(401).json({ error: event.reason })
    }

    if (event.ignore) {
      console.warn('[nowpayments-webhook] Ignored event:', event.reason, event.orderNumber)
      return res.status(200).json({ received: true, action: 'ignored', reason: event.reason })
    }

    if (event.status !== 'completed') {
      return res.status(200).json({ received: true, action: 'noop', status: event.status })
    }

    const { eventId, txId, orderNumber } = event

    if (!eventId || !orderNumber) {
      console.error('[nowpayments-webhook] Missing eventId or orderNumber on parsed event')
      return res.status(200).json({ received: true, action: 'no_order_ref' })
    }

    const { error: replayError } = await supabaseAdmin
      .from('webhook_events')
      .insert({ provider: 'nowpayments', event_id: eventId, tx_id: txId || null })

    if (replayError && replayError.code === '23505') {
      console.warn('[nowpayments-webhook] Replay detected, ignoring:', eventId)
      return res.status(200).json({ received: true, action: 'replay_ignored' })
    }

    const result = await finalizePaidOrder({ orderNumber })
    if (!result.ok) {
      if (result.reason === 'order_not_found') {
        console.error('[nowpayments-webhook] Order not found for:', orderNumber)
        return res.status(200).json({ received: true, action: 'order_not_found' })
      }
      console.error('[nowpayments-webhook] Finalize failed:', result.reason, result.error)
      return res.status(500).json({ error: result.error?.message || result.reason })
    }

    return res.status(200).json({ received: true, action: 'order_completed', order_number: orderNumber })
  } catch (err) {
    console.error('[nowpayments-webhook] Error:', err)
    return res.status(500).json({ error: err.message })
  }
}
