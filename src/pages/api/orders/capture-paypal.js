import { supabaseAdmin } from '../../../lib/supabase'
import { validateOrigin, rateLimit, validateString } from '../../../lib/security'
import { capturePaypalOrder } from '../../../lib/payments/paypalProcessor'
import { finalizePaidOrder } from '../../../lib/payments/finalizeOrder'
import { resolvePaypalAccount } from '../../../lib/payments/paypalAccounts'

// Smart-Buttons capture endpoint. The PayPal JS SDK's onApprove callback hits
// this from the customer's browser after they approve in the PayPal / Venmo /
// Apple Pay sheet. We call capturePaypalOrder server-side, then finalize.
//
// Order finalization (inventory, affiliate, confirmation email) runs HERE off
// the capture response — we no longer wait solely on the
// PAYMENT.CAPTURE.COMPLETED webhook, which can be delayed or dropped and would
// leave a paid order stuck awaiting_payment until the expire cron abandons it.
// finalizePaidOrder is idempotent (only acts on OPEN-state orders), so the
// COMPLETED webhook finalizing first (or this finalizing first) is safe — the
// loser no-ops. capturePaypalOrder is likewise idempotent on
// ORDER_ALREADY_CAPTURED.
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
      .select('id, payment_status, payment_method, paypal_account')
      .eq('order_number', order_number)
      .maybeSingle()

    if (!order || order.payment_method !== 'paypal') {
      return res.status(404).json({ error: 'Order not found' })
    }

    // Capture under the SAME account that created this order (multi-account
    // split). Legacy/null → OPP.
    const account = resolvePaypalAccount(order.paypal_account)
    const result = await capturePaypalOrder({ paypalOrderId: paypal_order_id, account })

    // Finalize off the capture response so a lost COMPLETED webhook can't
    // strand this paid order. Idempotent — if the webhook beat us, this no-ops
    // (order_not_found because it's no longer in an OPEN state). Failures here
    // are logged but don't fail the response: the customer WAS charged, and the
    // webhook remains the backup finalizer.
    if (result?.ok) {
      try {
        const fin = await finalizePaidOrder({
          orderNumber: order_number,
          paidAmount: result.amount ?? null,
          paidCurrency: result.currency ?? null,
        })
        if (!fin.ok && fin.reason !== 'order_not_found') {
          console.error('[capture-paypal] finalize failed:', fin.reason, fin.error)
        }
      } catch (finErr) {
        console.error('[capture-paypal] finalize threw (webhook will retry):', finErr.message)
      }
    }
    return res.status(200).json({ ok: true, order_number, ...result })
  } catch (err) {
    console.error('[capture-paypal] failed:', err.message)
    return res.status(502).json({ error: 'Capture failed. Please contact support if you were charged.' })
  }
}
