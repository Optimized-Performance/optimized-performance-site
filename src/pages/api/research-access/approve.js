import { supabaseAdmin } from '../../../lib/supabase'
import { validateOrigin, rateLimit } from '../../../lib/security'
import { verifyAccessToken } from '../../../lib/research-access-token'
import { sendResearchAccessApproved } from '../../../lib/customer-emails'

// One-tap approve, invoked by the confirm screen (POST) reached from the signed
// link in the operator's application email. The signed token IS the auth — no
// admin session — so it's verified strictly (HMAC + expiry, binds the exact
// applicant email). Grants purchasing access by adding the email to the
// gated_emails allowlist (idempotent) and notifies the applicant.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 30, windowMs: 60000 })) return res.status(429).json({ error: 'Too many requests' })
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  const { token } = req.body || {}
  const v = verifyAccessToken(token)
  if (!v.valid) return res.status(400).json({ error: 'This approval link is invalid or has expired.' })

  const email = v.email
  const { error } = await supabaseAdmin
    .from('gated_emails')
    .upsert({ email, note: `approved via email one-tap ${new Date().toISOString().slice(0, 10)}` }, { onConflict: 'email' })
  if (error) {
    console.error('[research-access/approve] allowlist upsert failed:', error.message)
    return res.status(500).json({ error: error.message })
  }

  // Reflect the decision in the admin queue (best-effort — the allowlist is the
  // source of truth for access; this just keeps the Requests tab in sync).
  await supabaseAdmin
    .from('research_access_requests')
    .update({ status: 'approved', decided_at: new Date().toISOString() })
    .eq('status', 'pending')
    .ilike('email', email)
    .then(({ error: e }) => { if (e) console.warn('[research-access/approve] queue sync skipped:', e.message) })

  // Notify the applicant (non-fatal) — closes their loop so they don't have to
  // guess when they're approved.
  sendResearchAccessApproved(email).catch((e) => console.warn('[research-access/approve] applicant notify failed:', e?.message))

  return res.status(200).json({ ok: true, email })
}
