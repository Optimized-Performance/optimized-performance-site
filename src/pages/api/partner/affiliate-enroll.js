import crypto from 'crypto'
import { supabaseAdmin } from '../../../lib/supabase'

// POST /api/partner/affiliate-enroll
//   { code, name, email, parent_code?, notes? }
//   Header: x-partner-secret = PARTNER_STATS_SECRET
//
// Auto-enrolls a Forged Coaching signup as an affiliate at the standard
// coach tier (10% commission / 10% customer discount), so a new coach's
// funnel links attribute from minute one instead of waiting on manual
// entry. If the requested code is taken, suffixed variants are tried
// (CODE2..CODE9). If this email already owns an active affiliate, that
// existing code is returned instead of creating a duplicate — retries and
// double-signups stay idempotent. parent_code (the recruiter's code, e.g.
// TRIS or another coach's) resolves to parent_affiliate_id so recruiter
// overrides accrue; an unknown parent is ignored, never a failure.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const secret = process.env.PARTNER_STATS_SECRET
  if (!secret) return res.status(503).json({ error: 'Partner enroll not configured' })
  const provided = String(req.headers['x-partner-secret'] || '')
  const a = Buffer.from(provided)
  const b = Buffer.from(secret)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  const { code, name, email, parent_code, notes } = req.body || {}
  const normalizedCode = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const cleanName = String(name || '').trim().slice(0, 120)
  const cleanEmail = String(email || '').trim().toLowerCase()
  if (!normalizedCode || normalizedCode.length < 3 || normalizedCode.length > 12) {
    return res.status(400).json({ error: 'Invalid code' })
  }
  if (!cleanName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: 'Invalid name or email' })
  }

  try {
    // Idempotency: one coach = one code. A retry or duplicate signup gets
    // the code they already own.
    const { data: existing } = await supabaseAdmin
      .from('affiliates')
      .select('code, commission_pct')
      .eq('email', cleanEmail)
      .eq('active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (existing) {
      return res.status(200).json({ ok: true, code: existing.code, commission_pct: existing.commission_pct, existing: true })
    }

    // Resolve the recruiter (fail-soft — enrollment never blocks on this).
    let parentAffiliateId = null
    const parentCode = String(parent_code || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (parentCode) {
      const { data: parent } = await supabaseAdmin
        .from('affiliates')
        .select('id')
        .eq('code', parentCode)
        .eq('active', true)
        .maybeSingle()
      if (parent) parentAffiliateId = parent.id
    }

    // Requested code first, then CODE2..CODE9 on collision.
    const candidates = [normalizedCode]
    for (let i = 2; i <= 9; i++) candidates.push(`${normalizedCode.slice(0, 11)}${i}`)

    for (const candidate of candidates) {
      const { data, error } = await supabaseAdmin
        .from('affiliates')
        .insert({
          name: cleanName,
          email: cleanEmail,
          code: candidate,
          discount_pct: 10,
          commission_pct: 10,
          active: true,
          notes: `Auto-enrolled via Forged Coaching signup.${notes ? ` ${String(notes).slice(0, 300)}` : ''}`,
          parent_affiliate_id: parentAffiliateId,
          is_flat_rate: false,
          recruiter_override_pct: 0,
          owner_affiliate_id: null,
          code_label: null,
        })
        .select('code, commission_pct')
        .single()

      if (!error) return res.status(200).json({ ok: true, code: data.code, commission_pct: data.commission_pct })
      if (error.code !== '23505') throw error // 23505 = code taken → try next
    }
    return res.status(409).json({ error: 'No available code variant' })
  } catch (e) {
    console.error('[partner/affiliate-enroll] failed', e.message)
    return res.status(500).json({ error: 'Enroll failed' })
  }
}
