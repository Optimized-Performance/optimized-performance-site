// Manually mark a Venmo order as paid after admin has visually confirmed the
// deposit in Venmo Business (@optimizedperformance) → BoA-1990 daily sweep.
// Triggers the same finalizePaidOrder helper that bankful + nowpayments +
// zelle paths use, so inventory decrement, affiliate stats, and the customer
// confirmation email all fire identically.
//
// Idempotent at the helper level: finalizePaidOrder only finds the order
// when payment_status='pending', so a second click after the first
// succeeds becomes a no-op order_not_found response.
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

    // Verify the order is a Venmo order in pending state — same defensive
    // pattern as mark-zelle-paid: don't trust the caller's id, and give the
    // admin UI a clear error if the button fires on the wrong row.
    let q = supabaseAdmin.from('orders').select('order_number, payment_status, payment_method')
    if (id) q = q.eq('id', id)
    else q = q.eq('order_number', String(order_number).trim().toUpperCase())
    const { data: order, error: fetchErr } = await q.maybeSingle()
    if (fetchErr || !order) return res.status(404).json({ error: 'Order not found' })

    if (order.payment_method !== 'venmo') {
      return res.status(409).json({ error: `Order payment_method is "${order.payment_method}", not "venmo". Refusing to mark paid via this endpoint.` })
    }
    if (order.payment_status !== 'pending') {
      return res.status(409).json({ error: `Order payment_status is "${order.payment_status}", not "pending". Nothing to do.` })
    }

    const result = await finalizePaidOrder({ orderNumber: order.order_number })
    if (!result.ok) {
      console.error('[orders/mark-venmo-paid] finalize failed:', result.reason, result.error)
      return res.status(500).json({ error: result.error?.message || result.reason })
    }

    return res.status(200).json({
      ok: true,
      order_number: order.order_number,
      message: 'Order marked paid. Customer confirmation email sent, inventory decremented, affiliate stats updated.',
    })
  } catch (err) {
    console.error('[orders/mark-venmo-paid] Error:', err)
    return res.status(500).json({ error: err.message })
  }
}
