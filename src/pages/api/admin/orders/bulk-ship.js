// Bulk-apply tracking numbers to a list of orders. Used by the admin
// "Bulk tracking paste" modal after labels are printed in ShipCheer.
//
// Request shape:
//   POST { assignments: [{ order_number, tracking }, ...] }
//
// Each assignment:
//   - looks up the order by order_number
//   - sets tracking + fulfillment_status='shipped' + shipped_at + shipment_notified_at
//   - fires the customer ship email (best-effort; failures don't roll back)
//
// Idempotent on shipment_notified_at — if an order already shipped, we
// update tracking but don't re-fire the email. Carriers occasionally
// reissue tracking and we don't want to spam customers.

import { supabaseAdmin } from '../../../../lib/supabase'
import { validateSessionToken } from '../../../../lib/session'
import { validateOrigin, rateLimit } from '../../../../lib/security'
import { sendShipmentNotification } from '../../../../lib/alerts'

function requireAuth(req) {
  const token = req.headers['x-admin-token']
  return validateSessionToken(token)
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
    const { assignments } = req.body || {}
    if (!Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({ error: 'assignments array required' })
    }
    if (assignments.length > 200) {
      return res.status(400).json({ error: 'Max 200 assignments per call' })
    }

    const results = []
    const emailJobs = []

    for (const a of assignments) {
      const orderNumber = String(a.order_number || '').trim().toUpperCase()
      const tracking = String(a.tracking || '').trim().slice(0, 200)

      if (!orderNumber || !tracking) {
        results.push({ order_number: orderNumber, status: 'skipped', reason: 'missing fields' })
        continue
      }

      const { data: prior, error: priorErr } = await supabaseAdmin
        .from('orders')
        .select('id, fulfillment_status, tracking, shipment_notified_at, customer_email, order_number')
        .eq('order_number', orderNumber)
        .maybeSingle()

      if (priorErr || !prior) {
        results.push({ order_number: orderNumber, status: 'not_found' })
        continue
      }

      const wasNotified = !!prior.shipment_notified_at
      const nowIso = new Date().toISOString()
      const patch = {
        tracking,
        fulfillment_status: 'shipped',
        updated_at: nowIso,
      }
      // Only stamp shipped_at + shipment_notified_at on the first shipment
      // transition. Re-applying tracking later doesn't re-fire the email.
      if (!wasNotified) {
        patch.shipped_at = nowIso
        patch.shipment_notified_at = nowIso
      }

      const { data: updated, error: updateErr } = await supabaseAdmin
        .from('orders')
        .update(patch)
        .eq('id', prior.id)
        .select()
        .single()

      if (updateErr) {
        results.push({ order_number: orderNumber, status: 'error', reason: updateErr.message })
        continue
      }

      results.push({ order_number: orderNumber, status: wasNotified ? 'updated' : 'shipped' })
      if (!wasNotified) emailJobs.push(updated)
    }

    // Fire customer ship emails AFTER all DB commits so a SendGrid blip
    // doesn't half-process the batch. Failures log but don't roll back.
    Promise.allSettled(emailJobs.map((o) => sendShipmentNotification(o))).catch(() => {})

    const summary = {
      total: assignments.length,
      shipped: results.filter((r) => r.status === 'shipped').length,
      updated: results.filter((r) => r.status === 'updated').length,
      not_found: results.filter((r) => r.status === 'not_found').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      errors: results.filter((r) => r.status === 'error').length,
    }

    return res.status(200).json({ ok: true, summary, results })
  } catch (err) {
    console.error('[orders/bulk-ship]', err)
    return res.status(500).json({ error: err.message })
  }
}
