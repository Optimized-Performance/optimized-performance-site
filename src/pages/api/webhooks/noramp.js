import { supabaseAdmin } from '../../../lib/supabase'
import { parseWebhookEvent } from '../../../lib/payments/cardProcessor'
import { finalizePaidOrder } from '../../../lib/payments/finalizeOrder'
import { applyBalancePayment } from '../../../lib/payments/balancePayment'
import { PAYMENT_STATUS } from '../../../lib/order-status'

// NoRamp (Whop-approved card rail) callback. Raw body required for the
// X-Platform-Signature HMAC verification (see cardProcessor norampParseWebhook).
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
    const event = await parseWebhookEvent({ rawBody, headers: req.headers })

    if (!event.verified) {
      console.error('[noramp-webhook] Verification failed:', event.reason)
      return res.status(401).json({ error: event.reason })
    }

    // connection.test (and any non-payment ping) — ack so the dashboard's
    // connection test + callback-URL capture succeeds.
    if (event.ignore) {
      return res.status(200).json({ received: true, action: 'ignored', reason: event.reason })
    }

    if (event.status !== 'completed') {
      return res.status(200).json({ received: true, action: 'noop', status: event.status })
    }

    const { eventId, txId, orderNumber } = event

    if (!eventId || !orderNumber) {
      console.error('[noramp-webhook] Missing eventId or orderNumber on parsed event')
      return res.status(200).json({ received: true, action: 'no_order_ref' })
    }

    const { error: replayError } = await supabaseAdmin
      .from('webhook_events')
      .insert({ provider: 'noramp', event_id: eventId, tx_id: txId || null })

    if (replayError && replayError.code === '23505') {
      console.warn('[noramp-webhook] Replay detected, ignoring:', eventId)
      return res.status(200).json({ received: true, action: 'replay_ignored' })
    }

    // Route by state: a balance_due order is settling an added balance from an
    // admin edit (money only — the edit already decremented inventory + credited
    // the affiliate for the added items). Anything else is a normal first
    // capture → full finalize (inventory/affiliate/confirmation).
    const { data: existing } = await supabaseAdmin
      .from('orders').select('payment_status').eq('order_number', orderNumber).maybeSingle()

    if (existing?.payment_status === PAYMENT_STATUS.BALANCE_DUE) {
      const bal = await applyBalancePayment({ orderNumber, paidAmount: event.amount ?? null })
      if (!bal.ok) {
        console.error('[noramp-webhook] Balance payment failed:', bal.reason, bal.error)
        return res.status(500).json({ error: bal.error?.message || bal.reason })
      }
      return res.status(200).json({
        received: true,
        action: bal.covered ? 'balance_settled' : 'balance_partial',
        order_number: orderNumber,
      })
    }

    const result = await finalizePaidOrder({ orderNumber })
    if (!result.ok) {
      if (result.reason === 'order_not_found') {
        console.error('[noramp-webhook] Order not found for:', orderNumber)
        return res.status(200).json({ received: true, action: 'order_not_found' })
      }
      console.error('[noramp-webhook] Finalize failed:', result.reason, result.error)
      return res.status(500).json({ error: result.error?.message || result.reason })
    }

    return res.status(200).json({ received: true, action: 'order_completed', order_number: orderNumber })
  } catch (err) {
    console.error('[noramp-webhook] Error:', err)
    return res.status(500).json({ error: err.message })
  }
}
