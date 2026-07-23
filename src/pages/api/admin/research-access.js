import { supabaseAdmin } from '../../../lib/supabase'
import { validateSessionToken } from '../../../lib/session'
import { validateOrigin, rateLimit } from '../../../lib/security'
import { sendResearchAccessApproved } from '../../../lib/customer-emails'

// Admin researcher-access queue. Backup to (and history for) the email one-tap.
//   GET                        -> list requests (pending first, newest first)
//   POST { id, action }        -> 'approve' | 'deny'
//     approve → add email to gated_emails (idempotent) + notify applicant + mark approved
//     deny    → mark denied (no allowlist change)
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
        .from('research_access_requests')
        .select('id, name, email, institution, role, intended_use, status, created_at, decided_at')
        // pending first, then most recent
        .order('status', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return res.status(200).json({ requests: data || [] })
    }

    if (req.method === 'POST') {
      const { id, action } = req.body || {}
      if (!id || !['approve', 'deny'].includes(action)) {
        return res.status(400).json({ error: 'id and action ("approve"|"deny") are required' })
      }
      const { data: reqRow, error: findErr } = await supabaseAdmin
        .from('research_access_requests').select('id, email, status').eq('id', id).maybeSingle()
      if (findErr) throw findErr
      if (!reqRow) return res.status(404).json({ error: 'Request not found' })

      const email = String(reqRow.email || '').trim().toLowerCase()

      if (action === 'approve') {
        const { error: upErr } = await supabaseAdmin
          .from('gated_emails')
          .upsert({ email, note: `approved via admin queue ${new Date().toISOString().slice(0, 10)}` }, { onConflict: 'email' })
        if (upErr) throw upErr
        sendResearchAccessApproved(email).catch((e) => console.warn('[admin/research-access] notify failed:', e?.message))
      }

      const { error: stErr } = await supabaseAdmin
        .from('research_access_requests')
        .update({ status: action === 'approve' ? 'approved' : 'denied', decided_at: new Date().toISOString() })
        .eq('id', id)
      if (stErr) throw stErr

      return res.status(200).json({ ok: true, id, status: action === 'approve' ? 'approved' : 'denied' })
    }

    return res.status(405).end()
  } catch (err) {
    console.error('[admin/research-access] error:', err)
    return res.status(500).json({ error: err.message })
  }
}
