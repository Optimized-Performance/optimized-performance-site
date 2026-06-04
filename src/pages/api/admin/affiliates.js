import { supabaseAdmin } from '../../../lib/supabase'
import { validateSessionToken } from '../../../lib/session'
import { validateOrigin, rateLimit, validateEmail, validateString } from '../../../lib/security'

// Clamp percent values to [0, 100]. Returns null on invalid, or defaultValue if provided.
function clampPercent(raw, defaultValue) {
  if (raw === undefined || raw === null || raw === '') {
    return defaultValue !== undefined ? defaultValue : null
  }
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    return defaultValue !== undefined ? defaultValue : null
  }
  return Math.round(n * 100) / 100
}

function requireAuth(req) {
  const token = req.headers['x-admin-token']
  return validateSessionToken(token)
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
      const { data, error } = await supabaseAdmin
        .from('affiliates')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return res.status(200).json(data || [])
    }

    if (req.method === 'POST') {
      const { name, email, code, discountPct, commissionPct, active, notes, parentAffiliateId, isFlatRate, recruiterOverridePct } = req.body
      if (!validateString(name) || !validateEmail(email)) {
        return res.status(400).json({ error: 'Invalid name or email' })
      }
      const normalizedCode = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
      if (!normalizedCode || normalizedCode.length > 50) {
        return res.status(400).json({ error: 'Invalid code' })
      }
      const discount = clampPercent(discountPct, 10)
      const commission = clampPercent(commissionPct, 5)

      const { data, error } = await supabaseAdmin
        .from('affiliates')
        .insert({
          name,
          email,
          code: normalizedCode,
          discount_pct: discount,
          commission_pct: commission,
          active: active !== false,
          notes: notes || '',
          parent_affiliate_id: parentAffiliateId || null,
          is_flat_rate: isFlatRate === true,
          recruiter_override_pct: clampPercent(recruiterOverridePct, 0),
        })
        .select()
        .single()

      if (error) {
        if (error.code === '23505') {
          return res.status(409).json({ error: 'Code already exists' })
        }
        throw error
      }
      return res.status(200).json(data)
    }

    if (req.method === 'PATCH') {
      const { id, ...updates } = req.body
      if (!id) return res.status(400).json({ error: 'Missing id' })

      const patch = {}
      if (updates.name !== undefined) patch.name = updates.name
      if (updates.email !== undefined) patch.email = updates.email
      if (updates.discountPct !== undefined) {
        const v = clampPercent(updates.discountPct)
        if (v === null) return res.status(400).json({ error: 'Invalid discountPct' })
        patch.discount_pct = v
      }
      if (updates.commissionPct !== undefined) {
        const v = clampPercent(updates.commissionPct)
        if (v === null) return res.status(400).json({ error: 'Invalid commissionPct' })
        patch.commission_pct = v
      }
      if (updates.active !== undefined) patch.active = !!updates.active
      if (updates.notes !== undefined) patch.notes = updates.notes
      if (updates.parentAffiliateId !== undefined) {
        const pid = updates.parentAffiliateId || null
        if (pid && pid === id) return res.status(400).json({ error: 'Affiliate cannot be its own recruiter' })
        patch.parent_affiliate_id = pid
      }
      if (updates.isFlatRate !== undefined) patch.is_flat_rate = !!updates.isFlatRate
      if (updates.recruiterOverridePct !== undefined) {
        patch.recruiter_override_pct = clampPercent(updates.recruiterOverridePct, 0)
      }
      patch.updated_at = new Date().toISOString()

      const { data, error } = await supabaseAdmin
        .from('affiliates')
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
      const { error } = await supabaseAdmin.from('affiliates').delete().eq('id', id)
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    return res.status(405).end()
  } catch (err) {
    console.error('Admin affiliates error:', err)
    return res.status(500).json({ error: err.message })
  }
}
