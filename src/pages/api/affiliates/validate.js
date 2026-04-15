import { supabaseAdmin } from '../../../lib/supabase'
import { validateOrigin, rateLimit } from '../../../lib/security'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 20, windowMs: 60000 })) {
    return res.status(429).json({ error: 'Too many requests' })
  }

  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Database not configured' })
    }

    const { code } = req.body
    if (!code || typeof code !== 'string' || code.length > 50) {
      return res.status(400).json({ error: 'Invalid code' })
    }

    const normalized = code.toUpperCase().trim()

    const { data, error } = await supabaseAdmin
      .from('affiliates')
      .select('code, discount_pct, commission_pct, active')
      .eq('code', normalized)
      .eq('active', true)
      .maybeSingle()

    if (error) {
      console.error('Affiliate validation failed:', error)
      return res.status(500).json({ error: 'Validation failed' })
    }

    if (!data) {
      return res.status(404).json({ error: 'Invalid or inactive code' })
    }

    // Return minimal info — only what checkout needs
    return res.status(200).json({
      code: data.code,
      discountPct: Number(data.discount_pct),
      commissionPct: Number(data.commission_pct),
    })
  } catch (err) {
    console.error('Affiliate validation error:', err)
    return res.status(500).json({ error: err.message })
  }
}
