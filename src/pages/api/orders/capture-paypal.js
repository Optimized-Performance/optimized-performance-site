import { supabaseAdmin } from '../../../lib/supabase'
import { validateOrigin, rateLimit, validateString } from '../../../lib/security'
import { capturePaypalOrder } from '../../../lib/payments/paypalProcessor'

// Smart-Buttons capture endpoint. The PayPal JS SDK's onApprove callback hits
// this from the customer's browser after they approve in the PayPal / Venmo /
// Apple Pay sheet. We call capturePaypalOrder server-side, then return 200.
//
// The actual order finalization (inventory, affiliate, confirmation email)
// still runs in /api/webhooks/paypal when PayPal delivers
// PAYMENT.CAPTURE.COMPLETED. capturePaypalOrder is idempotent (handles
// ORDER_ALREADY_CAPTURED), so if the CHECKOUT.ORDER.APPROVED webhook races us
// and captures first, this just returns alreadyCaptured: true.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 20, windowMs: 60000 })) return res.status(429).json({ error: 'Too many requests' })

  if (process.env.NEXT_PUBLIC_PAYPAL_ENABLED !== 'true') {
    return res.status(503).json({ error: 'PayPal payments are temporarily unavailable.' })
  }

  try {
    const { paypal_order_id, order_number } = req.body || {}
    if (!validateString(paypal_order_id, { minLength: 4, maxLength: 64 }) ||
        !validateString(order_number, { minLength: 4, maxLength: 64 })) {
      return res.status(400).json({ error: 'Invalid paypal_order_id or order_number' })
    }

    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Database not configured' })
    }

    // Confirm the order exists and is one we created. Don't expose internal
    // detail in the error message to a stranger probing this endpoint.
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('id, payment_status, payment_method')
      .eq('order_number', order_number)
      .maybeSingle()

    if (!order || order.payment_method !== 'paypal') {
      return res.status(404).json({ error: 'Order not found' })
    }

    const result = await capturePaypalOrder({ paypalOrderId: paypal_order_id })
    return res.status(200).json({ ok: true, order_number, ...result })
  } catch (err) {
    console.error('[capture-paypal] failed:', err.message)
    return res.status(502).json({ error: 'Capture failed. Please contact support if you were charged.' })
  }
}
