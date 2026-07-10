// Admin customer lookup + per-account VIP discount (v32).
//   GET  ?q=<email fragment>  → matching customers (id, email, discount_pct, verified)
//   PATCH { id, discountPct } → set/clear a customer's permanent account discount
//
// The discount applies only when that customer is logged in at checkout
// (order-create reads the session), so it can't be shared.

import { supabaseAdmin } from '../../../lib/supabase'
import { validateSessionToken } from '../../../lib/session'
import { validateOrigin, rateLimit } from '../../../lib/security'

function requireAuth(req) {
  return validateSessionToken(req.headers['x-admin-token'])
}

// Escape LIKE wildcards so a literal email fragment can't be turned into a
// pattern (defense-in-depth; admin-only endpoint).
function escapeLike(s) {
  return String(s).replace(/[\\%_]/g, '\\$&')
}

export default async function handler(req, res) {
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 60, windowMs: 60000 })) return res.status(429).json({ error: 'Too many requests' })
  if (!requireAuth(req)) return res.status(401).json({ error: 'Unauthorized' })
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  try {
    if (req.method === 'GET') {
      const q = String(req.query.q || '').trim()
      if (!q) return res.status(200).json({ customers: [] })
      const { data, error } = await supabaseAdmin
        .from('customers')
        .select('id, email, discount_pct, email_verified, created_at')
        .ilike('email', `%${escapeLike(q)}%`)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return res.status(200).json({ customers: data || [] })
    }

    if (req.method === 'PATCH') {
      const { id, discountPct, verify } = req.body || {}
      if (!id) return res.status(400).json({ error: 'Missing customer id' })

      // Manual email verification — for a customer who didn't receive / can't use
      // the verification link. Only unlocks account/order-history (never gates
      // purchasing), so this is a low-risk convenience.
      if (verify) {
        const { data, error } = await supabaseAdmin
          .from('customers')
          .update({ email_verified: true })
          .eq('id', id)
          .select('id, email, email_verified')
          .single()
        if (error) throw error
        return res.status(200).json({ ok: true, customer: data, message: `${data.email} manually verified.` })
      }

      const pct = Number(discountPct)
      if (!Number.isFinite(pct) || pct < 0 || pct > 90) {
        return res.status(400).json({ error: 'discountPct must be a number between 0 and 90' })
      }
      const { data, error } = await supabaseAdmin
        .from('customers')
        .update({ discount_pct: Math.round(pct * 100) / 100 })
        .eq('id', id)
        .select('id, email, discount_pct')
        .single()
      if (error) throw error
      return res.status(200).json({
        ok: true,
        customer: data,
        message: pct > 0
          ? `${data.email} now gets ${pct}% off (applies when logged in).`
          : `Discount cleared for ${data.email}.`,
      })
    }

    return res.status(405).end()
  } catch (err) {
    console.error('[admin/customers] error:', err)
    return res.status(500).json({ error: err.message })
  }
}
