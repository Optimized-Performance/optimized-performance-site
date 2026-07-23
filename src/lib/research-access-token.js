// Signed research-access decision tokens — SERVER ONLY (node:crypto).
// Powers the one-tap "Approve" button in the operator's application email:
// the link carries a signed token binding the applicant's email + an expiry,
// so approval needs no admin login but can't be forged. Same stateless HMAC
// shape as lib/customer-tokens.js — no token table.
//
// Format: base64url(payloadJSON) + "." + base64url(hmacSHA256)
//   payload = { t:'raccess', email, exp }
//
// Signing key: CUSTOMER_SESSION_SECRET (already required for sessions). Fail
// closed when unset — no token minted, nothing verifies.
//
// "Single use" is effective, not cryptographic: approval adds the email to
// gated_emails (idempotent — ON CONFLICT DO NOTHING), so re-clicking an
// already-used link is a harmless no-op rather than a double-grant.

import crypto from 'crypto'

const TTL_MS = 14 * 24 * 60 * 60 * 1000 // 14 days to act on an application

function signingKey() {
  return process.env.CUSTOMER_SESSION_SECRET || ''
}
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function fromB64url(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
}
function hmac(input, key) {
  return b64url(crypto.createHmac('sha256', key).update(input).digest())
}

export function signAccessToken(email) {
  const key = signingKey()
  const normalized = String(email || '').trim().toLowerCase()
  if (!key || !normalized) return null
  const payload = b64url(JSON.stringify({ t: 'raccess', email: normalized, exp: Date.now() + TTL_MS }))
  return `${payload}.${hmac(payload, key)}`
}

// Returns { valid, email } — never throws.
export function verifyAccessToken(token) {
  const key = signingKey()
  if (!key || !token || typeof token !== 'string') return { valid: false }
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return { valid: false }
  const expected = Buffer.from(hmac(payload, key))
  const received = Buffer.from(sig)
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return { valid: false }
  let data
  try { data = JSON.parse(fromB64url(payload)) } catch { return { valid: false } }
  if (data.t !== 'raccess' || !data.email) return { valid: false }
  if (!Number.isFinite(data.exp) || Date.now() > data.exp) return { valid: false }
  return { valid: true, email: String(data.email).trim().toLowerCase() }
}
