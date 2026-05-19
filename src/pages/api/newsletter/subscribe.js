import { supabaseAdmin } from '../../../lib/supabase'
import { validateOrigin, rateLimit, validateEmail, validateString } from '../../../lib/security'
import { extractClientIP } from '../../../lib/fraud-checks'

// Footer newsletter signup. Inserts into newsletter_subscribers with a
// case-insensitive unique constraint on lower(email) — duplicate signups
// return a friendly "already subscribed" response rather than an error so
// repeated submits don't reveal whether an email is in the list (privacy +
// avoids enumeration).

const ALLOWED_SOURCES = new Set(['footer', 'home_hero', 'oos_alert'])

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 5, windowMs: 60000 })) {
    return res.status(429).json({ error: 'Too many requests' })
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database not configured' })
  }

  const { email, source: rawSource } = req.body || {}
  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' })
  }

  const source = validateString(rawSource, { minLength: 1, maxLength: 40 }) && ALLOWED_SOURCES.has(rawSource)
    ? rawSource
    : 'footer'

  const ip = extractClientIP(req)
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 500)

  const { error } = await supabaseAdmin
    .from('newsletter_subscribers')
    .insert({
      email: email.trim(),
      source,
      ip,
      user_agent: userAgent,
    })

  if (error) {
    // 23505 = unique violation on lower(email). Treat as success — the
    // customer's intent is satisfied, and we don't leak whether the email
    // was already in the list.
    if (error.code === '23505') {
      return res.status(200).json({ ok: true, alreadySubscribed: true })
    }
    console.error('[newsletter/subscribe] insert failed:', error.message)
    return res.status(500).json({ error: 'Could not subscribe. Try again in a moment.' })
  }

  return res.status(200).json({ ok: true })
}
