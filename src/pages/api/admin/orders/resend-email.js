import { supabaseAdmin } from '../../../../lib/supabase'
import { validateSessionToken } from '../../../../lib/session'
import { validateOrigin, rateLimit } from '../../../../lib/security'
import { sendOrderConfirmation, sendShipmentNotification } from '../../../../lib/alerts'

// Manually re-send a customer email for one order (admin) — for the "I never
// got it" support case. Does NOT change order state or the idempotency
// stamps; a resend is a courtesy copy, not a state transition.
//
// POST { order_number, kind: 'confirmation' | 'tracking' }

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

  const { order_number: orderNumber, kind } = req.body || {}
  if (!orderNumber || typeof orderNumber !== 'string') {
    return res.status(400).json({ error: 'order_number required' })
  }
  if (kind !== 'confirmation' && kind !== 'tracking') {
    return res.status(400).json({ error: "kind must be 'confirmation' or 'tracking'" })
  }

  try {
    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('order_number', orderNumber)
      .maybeSingle()
    if (error) throw error
    if (!order) return res.status(404).json({ error: 'Order not found' })
    if (!order.customer_email) return res.status(400).json({ error: 'Order has no customer email.' })

    if (kind === 'tracking' && !order.tracking) {
      return res.status(400).json({ error: 'No tracking number on this order yet.' })
    }

    // The senders are fire-and-forget (log + swallow, return undefined), so the
    // only failure we can surface synchronously is "email isn't configured" —
    // guard that explicitly rather than report a false success. A 200 here means
    // "handed to SendGrid", matching how the rest of the app treats these sends.
    if (!process.env.SENDGRID_API_KEY) {
      return res.status(503).json({ error: 'Email is not configured (SENDGRID_API_KEY unset).' })
    }

    if (kind === 'confirmation') await sendOrderConfirmation(order)
    else await sendShipmentNotification(order)

    return res.status(200).json({ ok: true, kind, to: order.customer_email })
  } catch (err) {
    console.error('[resend-email]', err)
    return res.status(500).json({ error: err.message })
  }
}
