import { supabaseAdmin } from '../../../lib/supabase'
import { rateLimit } from '../../../lib/security'
import { getRailConfig, getRailUtilization, railAvailability } from '../../../lib/rail-utilization'

// GET /api/rails/availability
//   Public (checkout-facing). Returns { availability: { <rail>: bool } } — ONLY
//   the boolean, never the dollar caps/utilization (those are admin-only). The
//   checkout renders payment buttons gated on this. Fail-open: any error or
//   missing config returns {} so the UI defaults all rails to available; the
//   server-side cap enforcement in api/orders/create.js is authoritative.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  if (!rateLimit(req, { maxRequests: 60, windowMs: 60000 })) {
    return res.status(429).json({ error: 'Too many requests' })
  }
  if (!supabaseAdmin) return res.status(200).json({ availability: {} })
  try {
    const config = await getRailConfig(supabaseAdmin)
    const util = await getRailUtilization(supabaseAdmin)
    const avail = railAvailability(config, util)
    const out = {}
    for (const rail of Object.keys(avail)) out[rail] = avail[rail].available
    return res.status(200).json({ availability: out })
  } catch (err) {
    console.error('rails/availability error:', err)
    return res.status(200).json({ availability: {} }) // fail-open
  }
}
