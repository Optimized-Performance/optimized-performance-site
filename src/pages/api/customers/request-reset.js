import crypto from 'crypto'
import { signResetToken } from '../../../lib/customer-tokens'
import { sendPasswordResetEmail } from '../../../lib/customer-emails'
import { hashPassword } from '../../../lib/customer-session'
import { supabaseAdmin } from '../../../lib/supabase'
import { validateOrigin, rateLimit, validateEmail, escapeLike } from '../../../lib/security'

// Is this address a KNOWN prior customer with no login account yet? Grandfathered
// guest buyers (2026-07-22) were added to gated_emails for PURCHASE access but
// never got a login account — so behind the 2026-07-23 login wall they can't
// sign in AND the reset endpoint used to silently no-op, a dead end. Treat
// "on gated_emails" or "has a real order" as known, so reset can create the
// account for them (below). Genuine strangers stay unknown → silent no-op.
async function isKnownPriorCustomer(email) {
  const e = email.trim()
  const { data: g } = await supabaseAdmin
    .from('gated_emails').select('email').ilike('email', escapeLike(e)).maybeSingle()
  if (g) return true
  const { data: o } = await supabaseAdmin
    .from('orders').select('id').ilike('customer_email', escapeLike(e)).limit(1).maybeSingle()
  return !!o
}

// POST /api/customers/request-reset  Body: { email }
// ALWAYS returns 200 with the same body — whether or not the email has an
// account — so it can't be used to enumerate which emails are registered.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 5, windowMs: 60000 })) {
    return res.status(429).json({ error: 'Too many requests. Try again in a minute.' })
  }

  const { email } = req.body || {}
  if (!validateEmail(email)) return res.status(400).json({ error: 'A valid email is required.' })
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  const ok = { ok: true, message: 'If that email has an account, a reset link is on its way.' }

  let { data: customer } = await supabaseAdmin
    .from('customers')
    .select('id, email, password_hash')
    .ilike('email', escapeLike(email.trim()))
    .maybeSingle()

  // No login account. If this is a known prior customer (grandfathered guest
  // buyer), create the account on the fly with a random placeholder password so
  // this same reset flow sets their FIRST password — converting the old dead end
  // into a working path. Truly unknown emails get the identical silent no-op.
  let isNew = false
  if (!customer) {
    if (!(await isKnownPriorCustomer(email))) return res.status(200).json(ok)
    const placeholderHash = hashPassword(crypto.randomBytes(32).toString('hex'))
    const { data: created, error } = await supabaseAdmin
      .from('customers')
      .insert({ email: email.trim(), password_hash: placeholderHash, name: null })
      .select('id, email, password_hash')
      .single()
    if (error) {
      // Race: created between the lookup and this insert → re-fetch and proceed.
      if (error.code === '23505') {
        const { data: race } = await supabaseAdmin
          .from('customers').select('id, email, password_hash')
          .ilike('email', escapeLike(email.trim())).maybeSingle()
        customer = race
      } else {
        console.error('[customers/request-reset] account create failed:', error.message)
        return res.status(200).json(ok) // fail closed — never leak
      }
    } else {
      customer = created
      isNew = true
    }
    if (!customer) return res.status(200).json(ok)
  }

  const token = signResetToken(customer.id, customer.password_hash)
  if (token) {
    // Fire-and-forget keeps response timing identical for known vs unknown
    // emails (a timing oracle would otherwise leak which emails exist).
    sendPasswordResetEmail(customer, token, { isNew }).catch((err) =>
      console.error('[customers/request-reset] send failed:', err)
    )
  }
  return res.status(200).json(ok)
}
