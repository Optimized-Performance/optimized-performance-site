// Customer-facing order lookup. Public endpoint — auth is order_number +
// matching customer_email (both pieces appear in the order confirmation
// email, so a third party would need access to the customer's inbox to
// abuse this).
//
// Threat model:
//   - Random order-number guessing → blocked by email match + low-entropy
//     order numbers + tight rate limit
//   - Email enumeration → response is identical for "wrong order number"
//     and "wrong email" so the endpoint can't be used to verify whether
//     a given email placed an order
//   - Scraping order details at scale → rate limit (10 req/min per IP)
//
// Response is intentionally a SANITIZED subset of the order — never
// returns customer_ip, user_agent, fraud_status, fraud_reasons,
// affiliate_code, affiliate_commission_pct, internal notes, or anything
// else useful to an attacker.

import { supabaseAdmin } from '../../../lib/supabase'
import { validateOrigin, rateLimit, validateEmail } from '../../../lib/security'

function sanitize(order) {
  return {
    order_number: order.order_number,
    created_at: order.created_at,
    updated_at: order.updated_at,
    payment_status: order.payment_status,
    fulfillment_status: order.fulfillment_status || 'pending',
    items: (order.items || []).map((it) => ({
      name: it.name,
      sku: it.sku,
      dosage: it.dosage,
      quantity: it.quantity,
      price: it.price,
      isPreorder: !!it.isPreorder,
      preorderShipDate: it.isPreorder ? it.preorderShipDate || null : null,
    })),
    subtotal: order.subtotal,
    discount: order.discount,
    shipping: order.shipping,
    total: order.total,
    tracking: order.tracking || null,
    shipped_at: order.shipped_at || null,
    refunded_at: order.refunded_at || null,
    refund_amount: order.refund_amount || null,
    refund_reason: order.refund_reason || null,
    shipping_address: order.shipping_address,
    city: order.city,
    state: order.state,
    zip: order.zip,
    customer_name: order.customer_name,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 10, windowMs: 60000 })) {
    return res.status(429).json({ error: 'Too many requests. Try again in a minute.' })
  }
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  try {
    const { order_number, email } = req.body || {}
    if (!order_number || typeof order_number !== 'string') {
      return res.status(400).json({ error: 'Order number required' })
    }
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Email required' })
    }

    const normalizedOrderNumber = String(order_number).trim().toUpperCase()
    const normalizedEmail = String(email).trim().toLowerCase()

    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('order_number', normalizedOrderNumber)
      .maybeSingle()

    // Identical response for "no order" vs "email mismatch" — prevents
    // enumeration of which order numbers exist.
    if (error || !order || String(order.customer_email).toLowerCase() !== normalizedEmail) {
      return res.status(404).json({ error: 'No order matches that order number and email.' })
    }

    return res.status(200).json({ order: sanitize(order) })
  } catch (err) {
    console.error('[orders/lookup] Error:', err)
    return res.status(500).json({ error: 'Lookup failed.' })
  }
}
