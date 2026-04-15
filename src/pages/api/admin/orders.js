import { supabaseAdmin } from '../../../lib/supabase'
import { validateSessionToken } from '../../../lib/session'
import { validateOrigin, rateLimit } from '../../../lib/security'

function requireAuth(req) {
  const token = req.headers['x-admin-token']
  return validateSessionToken(token)
}

const ALLOWED_STATUSES = ['pending', 'packed', 'shipped', 'fulfilled']

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

      const patch = { updated_at: new Date().toISOString() }
      if (status !== undefined) {
        if (!ALLOWED_STATUSES.includes(status)) {
          return res.status(400).json({ error: 'Invalid status' })
        }
        patch.fulfillment_status = status
      }
      if (tracking !== undefined) patch.tracking = String(tracking).slice(0, 200)
      if (notes !== undefined) patch.notes = String(notes).slice(0, 1000)

      const { data, error } = await supabaseAdmin
        .from('orders')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return res.status(200).json(data)
    }

    if (req.method === 'DELETE') {
      const { id } = req.body
      if (!id) return res.status(400).json({ error: 'Missing id' })
      const { error } = await supabaseAdmin.from('orders').delete().eq('id', id)
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    return res.status(405).end()
  } catch (err) {
    console.error('Admin orders error:', err)
    return res.status(500).json({ error: err.message })
  }
}
