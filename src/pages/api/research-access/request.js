import { validateOrigin, rateLimit, validateEmail, validateString, escapeLike } from '../../../lib/security'
import { sendResearchAccessRequest } from '../../../lib/alerts'
import { sendResearchAccessApproved } from '../../../lib/customer-emails'
import { supabaseAdmin } from '../../../lib/supabase'
import { createCustomerToken, hashPassword, verifyPassword, customerSessionCookies } from '../../../lib/customer-session'
import { grantCohortCookies } from '../../../lib/cohort-session'

// Researcher-access application intake.
//  - Records the application in research_access_requests (the admin queue).
//  - Emails the operator (one-tap Approve button when in manual-review mode).
//  - MERGED REGISTER: if a password is supplied and no account exists for the
//    email, creates the customer account + signs them in, so the applicant
//    leaves already registered — when approved they can order immediately with
//    no separate sign-up step. (Existing-account emails skip creation; they
//    just sign in.)
//  - INSTANT APPROVAL (default ON, 2026-07-23): the launch-week manual queue
//    held every new buyer for up to a business day at purchase intent — with
//    card rails down it zeroed new-customer conversion. Access is now granted
//    at application time; the gate stays genuine (application on record,
//    attestation, operator notified on every grant, per-email revoke in
//    Admin → Access Requests / gated-emails). Set
//    NEXT_PUBLIC_RESEARCH_ACCESS_MANUAL_REVIEW=true and redeploy (build-time
//    var) to restore human pre-review.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 5, windowMs: 60000 })) {
    return res.status(429).json({ error: 'Too many requests — please try again shortly.' })
  }

  try {
    const { name, email, institution, role, intendedUse, password } = req.body || {}
    if (!validateString(name)) return res.status(400).json({ error: 'Please enter your name.' })
    if (!validateEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address.' })
    if (!validateString(institution)) return res.status(400).json({ error: 'Please enter your institution or affiliation.' })
    if (!validateString(intendedUse, { minLength: 10, maxLength: 2000 })) {
      return res.status(400).json({ error: 'Please describe your intended research use (a sentence or two).' })
    }
    const wantsAccount = typeof password === 'string' && password.length > 0
    if (wantsAccount && password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters (or leave it blank if you already have an account).' })
    }

    const cleanEmail = String(email).trim()
    const app = {
      name: String(name).trim(),
      email: cleanEmail,
      institution: String(institution).trim(),
      role: typeof role === 'string' ? role.trim() : '',
      intendedUse: String(intendedUse).trim(),
    }

    // ── merged register (optional) ──────────────────────────────────────────
    // New email + password → create the account and sign them in. Existing
    // email + matching password → sign them in (mirrors /api/customers/login,
    // same rate limit), so the inline gate-modal flow ends unlocked either
    // way. Existing email + wrong password → application still succeeds, they
    // just have to sign in themselves.
    let accountCreated = false
    let signedIn = false
    if (wantsAccount && supabaseAdmin) {
      const { data: existing } = await supabaseAdmin
        .from('customers').select('id, password_hash').ilike('email', escapeLike(cleanEmail)).maybeSingle()
      if (!existing) {
        try {
          const { data: customer, error } = await supabaseAdmin
            .from('customers')
            .insert({ email: cleanEmail, password_hash: hashPassword(password), name: app.name || null })
            .select('id, email, name').single()
          if (!error && customer) {
            const token = createCustomerToken(customer.id)
            if (token) { res.setHeader('Set-Cookie', customerSessionCookies(token)); grantCohortCookies(res); accountCreated = true; signedIn = true }
          } else if (error && error.code !== '23505') {
            console.warn('[research-access] account create skipped:', error.message)
          }
        } catch (e) {
          console.warn('[research-access] account create error (non-fatal):', e?.message)
        }
      } else if (existing.password_hash && verifyPassword(password, existing.password_hash)) {
        const token = createCustomerToken(existing.id)
        if (token) { res.setHeader('Set-Cookie', customerSessionCookies(token)); grantCohortCookies(res); signedIn = true }
      }
    }

    // ── instant approval (default ON — see header comment) ──────────────────
    // Falls back to the manual-review flow if the allowlist write fails, so a
    // DB hiccup degrades to "reviewed within 1 business day", never a dead end.
    const instantApproval = process.env.NEXT_PUBLIC_RESEARCH_ACCESS_MANUAL_REVIEW !== 'true'
    let approved = false
    if (instantApproval && supabaseAdmin) {
      const { error: gErr } = await supabaseAdmin
        .from('gated_emails')
        .upsert(
          { email: cleanEmail.toLowerCase(), note: `auto-approved on application ${new Date().toISOString().slice(0, 10)}` },
          { onConflict: 'email' }
        )
      if (gErr) console.warn('[research-access] auto-approve upsert failed — falling back to manual review:', gErr.message)
      else approved = true
    }

    // ── queue record (non-fatal — the email flow still works without it) ─────
    if (supabaseAdmin) {
      const { error: qErr } = await supabaseAdmin.from('research_access_requests').insert({
        name: app.name, email: cleanEmail, institution: app.institution, role: app.role, intended_use: app.intendedUse,
        status: approved ? 'approved' : 'pending', decided_at: approved ? new Date().toISOString() : null,
      })
      if (qErr) console.warn('[research-access] queue insert skipped (migration not run?):', qErr.message)
    }

    // ── operator notification (Approve button in manual mode; FYI in auto) ────
    const send = await sendResearchAccessRequest(app, { autoApproved: approved })
    if (!send?.ok) console.warn('[research-access] application not emailed:', JSON.stringify(send))

    // ── applicant notification (auto mode only — closes their loop) ──────────
    if (approved) {
      sendResearchAccessApproved(cleanEmail).catch((e) => console.warn('[research-access] applicant notify failed:', e?.message))
    }

    return res.status(200).json({ ok: true, accountCreated, signedIn, approved })
  } catch (err) {
    console.error('[research-access] error:', err)
    return res.status(500).json({ error: 'Something went wrong — please try again.' })
  }
}
