// Validate a recovery token client-side so checkout can show the correct
// discounted total before the customer submits. Mirrors /api/affiliates/validate:
// the client can't verify the HMAC (no secret in the browser), so it posts the
// token here and gets back { valid, pct }. The authoritative re-check happens
// again in /api/orders/create — this endpoint is for the customer-visible total.

import { validateOrigin, rateLimit } from '../../../lib/security'
import { verifyRecoveryToken } from '../../../lib/recovery'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 20, windowMs: 60000 })) {
    return res.status(429).json({ error: 'Too many requests' })
  }

  const { token } = req.body || {}
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Invalid token' })
  }

  const { valid, pct } = verifyRecoveryToken(token)
  if (!valid) return res.status(404).json({ error: 'Invalid or expired recovery link' })

  return res.status(200).json({ valid: true, pct })
}
