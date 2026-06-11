import { createCustomerToken, hashPassword, customerCookieHeader } from '../../../lib/customer-session'
import { signVerifyToken } from '../../../lib/customer-tokens'
import { sendVerificationEmail } from '../../../lib/customer-emails'
import { supabaseAdmin } from '../../../lib/supabase'
import { validateOrigin, rateLimit, validateEmail, validateString } from '../../../lib/security'

// POST /api/customers/register
//   Body: { email, password, name? }
//   Success → sets HttpOnly session cookie, returns { ok, customer }
//   Duplicate email → 409 (explicit, since registration intent is to create).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 10, windowMs: 60000 })) {
    return res.status(429).json({ error: 'Too many attempts' })
  }

  const { email, password, name } = req.body || {}
  if (!validateEmail(email) || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'A valid email and a password of at least 8 characters are required.' })
  }
  if (name != null && name !== '' && !validateString(name, { minLength: 1, maxLength: 120 })) {
    return res.status(400).json({ error: 'Invalid name.' })
  }
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  const normalizedEmail = email.trim()

  // Pre-check (the unique lower(email) index is the real race guard below).
  const { data: existing } = await supabaseAdmin
    .from('customers')
    .select('id')
    .ilike('email', normalizedEmail)
    .maybeSingle()
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' })
  }

  let passwordHash
  try {
    passwordHash = hashPassword(password)
  } catch {
    return res.status(500).json({ error: 'Server error.' })
  }

  const { data: customer, error } = await supabaseAdmin
    .from('customers')
    .insert({ email: normalizedEmail, password_hash: passwordHash, name: name ? name.trim() : null })
    .select('id, email, name')
    .single()

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' })
    }
    console.error('Customer register failed:', error)
    return res.status(500).json({ error: 'Could not create account.' })
  }

  let token
  try {
    token = createCustomerToken(customer.id)
  } catch (e) {
    console.error('createCustomerToken failed:', e)
    return res.status(500).json({ error: 'Server error — session unavailable.' })
  }

  // Fire-and-forget the verification email — registration (and checkout
  // behind the account gate) must never block or fail on SendGrid.
  const verifyToken = signVerifyToken(customer.id)
  if (verifyToken) {
    sendVerificationEmail(customer, verifyToken).catch((err) =>
      console.error('[customers/register] verification email failed:', err)
    )
  }

  res.setHeader('Set-Cookie', customerCookieHeader(token))
  return res.status(200).json({ ok: true, customer: { id: customer.id, email: customer.email, name: customer.name } })
}
