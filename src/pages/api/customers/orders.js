import { getCustomerIdFromReq } from '../../../lib/customer-session'
import { supabaseAdmin } from '../../../lib/supabase'
import { detectCarrierAndUrl } from '../../../lib/alerts'
import { rateLimit } from '../../../lib/security'

// GET /api/customers/orders — order history for the signed-in customer.
//
// GATED ON email_verified: orders are matched by email, and an unverified
// account is just a claim on an email — without this gate anyone could
// register someone else's address and read their order history (items +
// shipping address). 403 + needsVerification:true tells the dashboard to
// show the verify banner instead.
//
// Response is the same sanitized subset as /api/orders/lookup, plus the
// item product `id`s (for one-click reorder) and server-detected carrier.
function sanitize(order) {
  const { carrier, url } = order.tracking ? detectCarrierAndUrl(order.tracking) : { carrier: null, url: null }
  return {
    order_number: order.order_number,
    created_at: order.created_at,
    payment_status: order.payment_status,
    fulfillment_status: order.fulfillment_status || 'pending',
    items: (order.items || []).map((it) => ({
      id: it.id || null,
      name: it.name,
      sku: it.sku,
      quantity: it.quantity,
      price: it.price,
      isPreorder: !!it.isPreorder,
    })),
    subtotal: order.subtotal,
    discount: order.discount,
    shipping: order.shipping,
    total: order.total,
    tracking: order.tracking || null,
    tracking_carrier: carrier,
    tracking_url: url,
    shipped_at: order.shipped_at || null,
    refunded_at: order.refunded_at || null,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  if (!rateLimit(req, { maxRequests: 30, windowMs: 60000 })) {
    return res.status(429).json({ error: 'Too many requests.' })
  }

  const customerId = getCustomerIdFromReq(req)
  if (!customerId) return res.status(401).json({ error: 'Not authenticated' })
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  const { data: customer, error: custErr } = await supabaseAdmin
    .from('customers')
    .select('id, email, email_verified')
    .eq('id', customerId)
    .maybeSingle()
  if (custErr || !customer) {
    // Missing email_verified column (pre-v27) also lands here — treat as
    // unverified rather than erroring.
    if (custErr) console.error('[customers/orders] customer fetch failed:', custErr)
    return custErr
      ? res.status(403).json({ error: 'Verify your email to see order history.', needsVerification: true })
      : res.status(401).json({ error: 'Not authenticated' })
  }
  if (!customer.email_verified) {
    return res.status(403).json({ error: 'Verify your email to see order history.', needsVerification: true })
  }

  const { data: orders, error } = await supabaseAdmin
    .from('orders')
    .select('order_number, created_at, payment_status, fulfillment_status, items, subtotal, discount, shipping, total, tracking, shipped_at, refunded_at, customer_email')
    .ilike('customer_email', customer.email)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[customers/orders] query failed:', error)
    return res.status(500).json({ error: 'Could not load orders.' })
  }

  return res.status(200).json({ orders: (orders || []).map(sanitize) })
}
