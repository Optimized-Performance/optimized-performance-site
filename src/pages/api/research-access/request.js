import { validateOrigin, rateLimit, validateEmail, validateString, escapeLike } from '../../../lib/security'
import { sendResearchAccessRequest } from '../../../lib/alerts'
import { supabaseAdmin } from '../../../lib/supabase'
import { createCustomerToken, hashPassword, customerCookieHeader } from '../../../lib/customer-session'
import { grantCohortCookies } from '../../../lib/cohort-session'

// Researcher-access application intake.
//  - Records the application in research_access_requests (the admin queue).
//  - Emails the operator with a one-tap Approve button (lib/alerts).
//  - MERGED REGISTER: if a password is supplied and no account exists for the
//    email, creates the customer account + signs them in, so the applicant
//    leaves already registered — when approved they can order immediately with
//    no separate sign-up step. (Existing-account emails skip creation; they
//    just sign in.) No auto-approval — manual review keeps the gate genuine.
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
    // Only when a password is given AND no account exists for this email.
    let accountCreated = false
    if (wantsAccount && supabaseAdmin) {
      const { data: existing } = await supabaseAdmin
        .from('customers').select('id').ilike('email', escapeLike(cleanEmail)).maybeSingle()
      if (!existing) {
        try {
          const { data: customer, error } = await supabaseAdmin
            .from('customers')
            .insert({ email: cleanEmail, password_hash: hashPassword(password), name: app.name || null })
            .select('id, email, name').single()
          if (!error && customer) {
            const token = createCustomerToken(customer.id)
            if (token) { res.setHeader('Set-Cookie', customerCookieHeader(token)); grantCohortCookies(res); accountCreated = true }
          } else if (error && error.code !== '23505') {
            console.warn('[research-access] account create skipped:', error.message)
          }
        } catch (e) {
          console.warn('[research-access] account create error (non-fatal):', e?.message)
        }
      }
    }

    // ── queue record (non-fatal — the email flow still works without it) ─────
    if (supabaseAdmin) {
      const { error: qErr } = await supabaseAdmin.from('research_access_requests').insert({
        name: app.name, email: cleanEmail, institution: app.institution, role: app.role, intended_use: app.intendedUse,
      })
      if (qErr) console.warn('[research-access] queue insert skipped (migration not run?):', qErr.message)
    }

    // ── operator notification with one-tap Approve button ────────────────────
    const send = await sendResearchAccessRequest(app)
    if (!send?.ok) console.warn('[research-access] application not emailed:', JSON.stringify(send))

    return res.status(200).json({ ok: true, accountCreated })
  } catch (err) {
    console.error('[research-access] error:', err)
    return res.status(500).json({ error: 'Something went wrong — please try again.' })
  }
}
