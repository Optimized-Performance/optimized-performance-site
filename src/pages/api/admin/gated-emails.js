import { supabaseAdmin } from '../../../lib/supabase'
import { validateSessionToken } from '../../../lib/session'
import { validateOrigin, rateLimit, validateEmail } from '../../../lib/security'

// Admin management of the account-gated allowlist (by email). Powers the
// grant/revoke UI. Auth mirrors the other admin endpoints.
//   GET                 -> list allowlisted emails
//   POST {email, note}  -> grant (upsert, normalized lowercase)
//   DELETE {email}      -> revoke
function requireAuth(req) {
  return validateSessionToken(req.headers['x-admin-token'])
}

export default async function handler(req, res) {
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 60, windowMs: 60000 })) return res.status(429).json({ error: 'Too many requests' })
  if (!requireAuth(req)) return res.status(401).json({ error: 'Unauthorized' })
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('gated_emails')
        .select('email, note, created_at')
        .order('created_at', { ascending: false })
      if (error) throw error
      return res.status(200).json({ emails: data || [] })
    }

    if (req.method === 'POST') {
      const body = req.body || {}
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
      if (!validateEmail(email)) return res.status(400).json({ error: 'Valid email required' })
      const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) : null
      const { data, error } = await supabaseAdmin
        .from('gated_emails')
        .upsert({ email, note }, { onConflict: 'email' })
        .select()
        .single()
      if (error) throw error
      return res.status(201).json({ email: data })
    }

    if (req.method === 'DELETE') {
      const body = req.body || {}
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
      if (!email) return res.status(400).json({ error: 'email required' })
      const { error } = await supabaseAdmin.from('gated_emails').delete().eq('email', email)
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    return res.status(405).end()
  } catch (err) {
    console.error('[admin/gated-emails] error:', err)
    return res.status(500).json({ error: err.message })
  }
}
