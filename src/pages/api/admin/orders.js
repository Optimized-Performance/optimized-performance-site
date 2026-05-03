import { supabaseAdmin } from '../../../lib/supabase'
import { validateSessionToken } from '../../../lib/session'
import { validateOrigin, rateLimit } from '../../../lib/security'
import { sendShipmentNotification } from '../../../lib/alerts'

function requireAuth(req) {
  const token = req.headers['x-admin-token']
  return validateSessionToken(token)
}

const ALLOWED_STATUSES = ['pending', 'packed', 'shipped', 'fulfilled', 'cancelled']

export default async function handler(req, res) {
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 60, windowMs: 60000 })) {
    return res.status(429).json({ error: 'Too many requests' })
  }
  if (!requireAuth(req)) return res.status(401).json({ error: 'Unauthorized' })
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return res.status(200).json(data || [])
    }

    if (req.method === 'PATCH') {
      const { id, status, tracking, notes } = req.body
      if (!id) return res.status(400).json({ error: 'Missing id' })

      // Pull the prior row so we can detect transitions (pending→shipped) and
      // decide whether to fire the customer ship email.
      const { data: prior, error: priorErr } = await supabaseAdmin
        .from('orders')
        .select('fulfillment_status, tracking, shipment_notified_at')
        .eq('id', id)
        .single()
      if (priorErr) throw priorErr

      const patch = { updated_at: new Date().toISOString() }
      if (status !== undefined) {
        if (!ALLOWED_STATUSES.includes(status)) {
          return res.status(400).json({ error: 'Invalid status' })
        }
        patch.fulfillment_status = status
      }
      if (tracking !== undefined) patch.tracking = String(tracking).slice(0, 200)
      if (notes !== undefined) patch.notes = String(notes).slice(0, 1000)

      const newStatus = patch.fulfillment_status ?? prior?.fulfillment_status
      const newTracking = patch.tracking ?? prior?.tracking
      const wasNotified = !!prior?.shipment_notified_at

      // Fire the customer ship email if status is now 'shipped', tracking is
      // set, and we haven't already notified for this shipment. Setting
      // shipment_notified_at + shipped_at on the same patch makes this idempotent.
      const shouldNotify = newStatus === 'shipped' && newTracking && !wasNotified
      if (shouldNotify) {
        const nowIso = new Date().toISOString()
        patch.shipped_at = patch.shipped_at || nowIso
        patch.shipment_notified_at = nowIso
      }

      const { data, error } = await supabaseAdmin
        .from('orders')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error

      // Send AFTER the DB commits so a failed email doesn't roll back the status.
      // Failures are logged inside sendShipmentNotification — non-blocking.
      if (shouldNotify) {
        sendShipmentNotification(data).catch((e) => {
          console.error('[orders PATCH] sendShipmentNotification failed:', e)
        })
      }

      return res.status(200).json(data)
    }

    // Hard-delete removed for audit/compliance. Use PATCH { status: 'cancelled' } instead.
    return res.status(405).end()
  } catch (err) {
    console.error('Admin orders error:', err)
    return res.status(500).json({ error: err.message })
  }
}
