import { verifyRecoveryToken } from '../../../lib/recovery'
import { supabaseAdmin } from '../../../lib/supabase'
import { rateLimit } from '../../../lib/security'
import { getCatalog } from '../../../lib/catalog'

// POST /api/recovery/cart  Body: { token }
// Returns the cart lines of the order a recovery token is bound to, so the
// storefront can rebuild the exact abandoned cart on arrival.
//
// Resolves each line against the catalog SERVER-SIDE and returns display fields
// (name/price/sku/etc.) — the client no longer imports the product catalog
// (that shipped restricted SKUs into the bundle and defeated the cohort gate).
// Scope is limited to the customer's OWN order lines bound to this token, and
// the charge is always recomputed server-side at checkout, so a stale display
// price can't be replayed.
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

  const products = await getCatalog()
  const items = (order.items || [])
    .filter((it) => it && it.id)
    .map((it) => {
      const p = products.find((pp) => pp.id === it.id) || {}
      return {
        id: it.id,
        quantity: Math.max(1, Math.min(99, Number(it.quantity) || 1)),
        isPreorder: !!it.isPreorder,
        preorderShipDate: it.isPreorder ? it.preorderShipDate || null : null,
        name: p.name ?? null,
        sku: p.sku ?? null,
        dosage: p.dosage ?? null,
        price: typeof p.price === 'number' ? p.price : null,
        category: p.category ?? null,
        format: p.format ?? null,
        vialSize: p.vialSize ?? null,
        isKit: p.isKit || false,
        parentId: p.parentId || null,
        vialCount: p.vialCount || null,
        purity: p.purity ?? null,
        badge: p.badge ?? null,
        durableRailsOnly: p.durableRailsOnly || false,
        noCoa: p.noCoa || false,
      }
    })
    // Drop any line whose product no longer exists / isn't priced — the client
    // reviver requires a numeric price.
    .filter((it) => typeof it.price === 'number')

  return res.status(200).json({ items })
}
