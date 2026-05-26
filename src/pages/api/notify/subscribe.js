import { supabaseAdmin } from '../../../lib/supabase'
import { validateOrigin, rateLimit, validateEmail, validateString } from '../../../lib/security'
import { extractClientIP } from '../../../lib/fraud-checks'

// "Notify me when it ships" capture for preorder / coming-soon SKUs. Writes
// to product_notify_requests (migration v19) keyed by (lower(email),
// product_sku). Duplicate requests for the same email+SKU return a friendly
// "you're on the list" success rather than an error — same privacy posture
// as the footer newsletter (never reveal whether an email is already stored).
//
// Distinct from /api/newsletter/subscribe: that table is email-unique (one
// row per address); this one is (email, product) unique so a footer
// subscriber can also request a MOTS-C alert, and we can blast a per-SKU
// launch list when inventory lands.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 5, windowMs: 60000 })) {
    return res.status(429).json({ error: 'Too many requests' })
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database not configured' })
  }

  const { email, product_sku, product_id } = req.body || {}
  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' })
  }
  if (!validateString(product_sku, { minLength: 2, maxLength: 64 })) {
    return res.status(400).json({ error: 'Missing product reference.' })
  }
  const productId = validateString(product_id, { minLength: 1, maxLength: 64 })
    ? product_id
    : null

  const ip = extractClientIP(req)
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 500)

  const { error } = await supabaseAdmin
    .from('product_notify_requests')
    .insert({
      email: email.trim(),
      product_sku,
      product_id: productId,
      ip,
      user_agent: userAgent,
    })

  if (error) {
    // 23505 = unique violation on (lower(email), product_sku). The customer's
    // intent is already recorded — treat as success, don't leak membership.
    if (error.code === '23505') {
      return res.status(200).json({ ok: true, alreadySubscribed: true })
    }
    console.error('[notify/subscribe] insert failed:', error.message)
    return res.status(500).json({ error: 'Could not save your request. Try again in a moment.' })
  }

  return res.status(200).json({ ok: true })
}
