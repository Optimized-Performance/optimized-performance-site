import { verifyRecoveryToken } from '../../../lib/recovery'
import { supabaseAdmin } from '../../../lib/supabase'
import { rateLimit } from '../../../lib/security'

// POST /api/recovery/cart  Body: { token }
// Returns the cart lines of the order a recovery token is bound to, so the
// storefront can rebuild the exact abandoned cart on arrival.
//
// Deliberately returns ONLY { id, quantity, isPreorder, preorderShipDate } —
// no names, prices, totals, or customer fields. The client re-joins ids
// against the live catalog (same as cart hydration), so a leaked link
// exposes nothing and prices can't be replayed stale.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!rateLimit(req, { maxRequests: 20, windowMs: 60000 })) {
    return res.status(429).json({ error: 'Too many requests.' })
  }

  const { token } = req.body || {}
  const { valid, orderNumber } = verifyRecoveryToken(token)
  // Valid token without an order (replenishment links) → empty, not an error.
  if (!valid || !orderNumber) return res.status(200).json({ items: [] })
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select('order_number, payment_status, items')
    .eq('order_number', orderNumber)
    .maybeSingle()

  if (error || !order) return res.status(200).json({ items: [] })

  // Only rebuild carts for orders still worth recovering — a completed or
  // refunded order's recovery link shouldn't refill the cart.
  if (!['awaiting_payment', 'abandoned', 'pending'].includes(order.payment_status)) {
    return res.status(200).json({ items: [] })
  }

  const items = (order.items || [])
    .filter((it) => it && it.id)
    .map((it) => ({
      id: it.id,
      quantity: Math.max(1, Math.min(99, Number(it.quantity) || 1)),
      isPreorder: !!it.isPreorder,
      preorderShipDate: it.isPreorder ? it.preorderShipDate || null : null,
    }))

  return res.status(200).json({ items })
}
