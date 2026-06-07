// Event ingest for first-party funnel instrumentation. Receives anonymous
// events from lib/track (sendBeacon), filters obvious bots, and inserts via the
// service role. Fire-and-forget: returns 204 fast and never blocks the client.

import { supabaseAdmin } from '../../lib/supabase'
import { validateOrigin, rateLimit } from '../../lib/security'

const EVENT_TYPES = new Set(['page_view', 'product_view', 'add_to_cart', 'checkout_start', 'payment_attempt'])
const BOT_RE = /bot|crawl|spider|slurp|bing|google|facebookexternalhit|preview|monitor|headless|curl|wget|python-requests/i

function clip(v, n) {
  return typeof v === 'string' ? v.slice(0, n) : null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!validateOrigin(req)) return res.status(403).end()
  // Generous — a single browse session fires many events.
  if (!rateLimit(req, { maxRequests: 120, windowMs: 60000 })) return res.status(204).end()

  // Drop obvious bots/crawlers so the funnel reflects humans.
  const ua = String(req.headers['user-agent'] || '')
  if (!ua || BOT_RE.test(ua)) return res.status(204).end()

  try {
    // sendBeacon sends a Blob; body may be parsed or a raw string depending on runtime.
    let b = req.body
    if (typeof b === 'string') { try { b = JSON.parse(b) } catch { b = {} } }
    b = b || {}

    if (!b.session_id || !EVENT_TYPES.has(b.event_type)) return res.status(204).end()
    if (!supabaseAdmin) return res.status(204).end()

    const value = Number(b.value)
    await supabaseAdmin.from('events').insert({
      session_id: clip(b.session_id, 64),
      event_type: b.event_type,
      path: clip(b.path, 256),
      product_id: clip(b.product_id, 64),
      ref: b.ref ? clip(String(b.ref).toUpperCase(), 50) : null,
      value: Number.isFinite(value) ? value : null,
      meta: b.meta && typeof b.meta === 'object' ? b.meta : null,
    })
  } catch (err) {
    // Never surface — analytics ingest failing must not affect the customer.
    console.error('[track] insert failed:', err.message)
  }
  return res.status(204).end()
}
