// Manually mark ANY stuck order as paid after the admin has verified funds
// out-of-band. Generic, method-agnostic counterpart to mark-zelle-paid /
// mark-venmo-paid — built for crypto/card orders that get stuck in
// 'awaiting_payment' that no dedicated button covers:
//   - an UNDERPAID crypto invoice: NOWPayments returns 'partially_paid', and
//     cryptoProcessor parks it (ignore=true, "manual review") by design — the
//     webhook never completes it. This button completes that review.
//   - a missed / late processor webhook the admin has confirmed landed in the
//     processor dashboard (PayPal/NOWPayments) but never flipped the order.
//
// Triggers the same finalizePaidOrder helper the webhooks use, so inventory
// decrement, affiliate stats, and the customer confirmation email all fire
// identically. Idempotent at the helper level: finalizePaidOrder only matches
// payment_status in ('pending','awaiting_payment'), so a later webhook (e.g.
// the customer tops up the crypto shortfall → 'finished') is a no-op.
//
// Auth: admin session token in x-admin-token header (same as other admin
// endpoints).

import { supabaseAdmin } from '../../../../lib/supabase'
import { validateSessionToken } from '../../../../lib/session'
import { validateOrigin, rateLimit } from '../../../../lib/security'
import { finalizePaidOrder } from '../../../../lib/payments/finalizeOrder'

function requireAuth(req) {
  return validateSessionToken(req.headers['x-admin-token'])
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
    const { id, order_number } = req.body || {}
    if (!id && !order_number) {
      return res.status(400).json({ error: 'Missing order id or order_number' })
    }

    // Look up the order (don't trust the caller's state) to give the admin a
    // clear message and to gate which statuses are manually completable.
    let q = supabaseAdmin.from('orders').select('order_number, payment_status, payment_method')
    if (id) q = q.eq('id', id)
    else q = q.eq('order_number', String(order_number).trim().toUpperCase())
    const { data: order, error: fetchErr } = await q.maybeSingle()
    if (fetchErr || !order) return res.status(404).json({ error: 'Order not found' })

    if (order.payment_status === 'completed') {
      return res.status(409).json({ error: 'Order is already completed. Nothing to do.' })
    }
    // finalizePaidOrder accepts 'pending' + 'awaiting_payment'; guard the rest
    // here so the admin gets a clear refusal instead of a silent no-op.
    if (!['pending', 'awaiting_payment'].includes(order.payment_status)) {
      return res.status(409).json({ error: `Order payment_status is "${order.payment_status}" — only "awaiting_payment" or "pending" orders can be manually marked paid.` })
    }

    const result = await finalizePaidOrder({ orderNumber: order.order_number })
    if (!result.ok) {
      console.error('[orders/mark-paid] finalize failed:', result.reason, result.error)
      return res.status(500).json({ error: result.error?.message || result.reason })
    }

    return res.status(200).json({
      ok: true,
      order_number: order.order_number,
      message: 'Order marked paid. Customer confirmation email sent, inventory decremented, affiliate stats updated.',
    })
  } catch (err) {
    console.error('[orders/mark-paid] Error:', err)
    return res.status(500).json({ error: err.message })
  }
}
