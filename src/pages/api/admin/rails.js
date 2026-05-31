import { supabaseAdmin } from '../../../lib/supabase'
import { validateSessionToken } from '../../../lib/session'
import { validateOrigin, rateLimit } from '../../../lib/security'
import { getRailConfig, getRailUtilization, railAvailability } from '../../../lib/rail-utilization'

function requireAuth(req) {
  return validateSessionToken(req.headers['x-admin-token'])
}

// Clamp a cap value: '' or null -> null (uncapped); otherwise a non-negative number.
function parseCap(raw) {
  if (raw === '' || raw === null || raw === undefined) return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return undefined // invalid sentinel
  return Math.round(n * 100) / 100
}

export default async function handler(req, res) {
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 60, windowMs: 60000 })) {
    return res.status(429).json({ error: 'Too many requests' })
  }
  if (!requireAuth(req)) return res.status(401).json({ error: 'Unauthorized' })
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  try {
    if (req.method === 'GET') {
      const config = await getRailConfig(supabaseAdmin)
      const util = await getRailUtilization(supabaseAdmin)
      const avail = railAvailability(config, util)
      const rails = Object.values(config)
        .sort((a, b) => (a.sort_order || 100) - (b.sort_order || 100))
        .map((c) => ({ ...c, ...avail[c.rail] }))
      return res.status(200).json({ rails })
    }

    if (req.method === 'PATCH') {
      const { rail, ...updates } = req.body
      if (!rail || typeof rail !== 'string') return res.status(400).json({ error: 'Missing rail' })

      const patch = { updated_at: new Date().toISOString() }
      if (updates.enabled !== undefined) patch.enabled = !!updates.enabled
      if (updates.monthly_cap !== undefined) {
        const v = parseCap(updates.monthly_cap)
        if (v === undefined) return res.status(400).json({ error: 'Invalid monthly_cap' })
        patch.monthly_cap = v
      }
      if (updates.daily_cap !== undefined) {
        const v = parseCap(updates.daily_cap)
        if (v === undefined) return res.status(400).json({ error: 'Invalid daily_cap' })
        patch.daily_cap = v
      }
      if (updates.notes !== undefined) patch.notes = String(updates.notes).slice(0, 500)

      const { data, error } = await supabaseAdmin
        .from('rail_config')
        .update(patch)
        .eq('rail', rail)
        .select()
        .single()
      if (error) throw error
      return res.status(200).json(data)
    }

    return res.status(405).end()
  } catch (err) {
    console.error('admin/rails error:', err)
    return res.status(500).json({ error: err.message })
  }
}
