// Single-purpose customer tokens (email verification + password reset) —
// SERVER ONLY (node:crypto). Same stateless HMAC-blob shape as lib/recovery.js
// so there is no token table to migrate or clean up.
//
// Format:  base64url(payloadJSON) + "." + base64url(hmacSHA256)
//   verify payload = { t:'verify', cid, exp }
//   reset  payload = { t:'reset',  cid, exp }
//
// Reset tokens are additionally bound to a fragment of the CURRENT
// password_hash (mixed into the HMAC input, never into the payload): the
// moment the password changes, every previously-issued reset link dies.
// That gives stateless tokens the one property they normally lack —
// effective single-use — without a revocation table.
//
// Signing key: CUSTOMER_SESSION_SECRET (already required for customer
// sessions). Fail closed when unset: no token minted, nothing verifies.

import crypto from 'crypto'

const VERIFY_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const RESET_TTL_MS = 60 * 60 * 1000 // 1 hour

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

// The last 16 chars of the scrypt hash string — enough to bind the token to
// this exact password without leaking meaningful hash material into the HMAC.
function hashFragment(passwordHash) {
  return String(passwordHash || '').slice(-16)
}

export function signVerifyToken(customerId) {
  const key = signingKey()
  if (!key || !customerId) return null
  const payloadB64 = b64url(JSON.stringify({ t: 'verify', cid: customerId, exp: Date.now() + VERIFY_TTL_MS }))
  return `${payloadB64}.${hmac(payloadB64, key)}`
}

export function signResetToken(customerId, passwordHash) {
  const key = signingKey()
  if (!key || !customerId) return null
  const payloadB64 = b64url(JSON.stringify({ t: 'reset', cid: customerId, exp: Date.now() + RESET_TTL_MS }))
  return `${payloadB64}.${hmac(`${payloadB64}.${hashFragment(passwordHash)}`, key)}`
}

// Both verifiers return { valid, customerId }. Constant-time compare; never
// throw. Reset verification needs the customer's CURRENT password_hash (the
// caller looks the customer up via peekCustomerId first).
export function verifyVerifyToken(token) {
  return verify(token, 'verify', (payloadB64) => payloadB64)
}

export function verifyResetToken(token, passwordHash) {
  return verify(token, 'reset', (payloadB64) => `${payloadB64}.${hashFragment(passwordHash)}`)
}

// Read the customerId out of a token WITHOUT trusting it — used only to fetch
// the customer row needed for full reset verification. Never act on this
// alone.
export function peekCustomerId(token) {
  try {
    const dot = String(token).indexOf('.')
    if (dot <= 0) return null
    const payload = JSON.parse(fromB64url(String(token).slice(0, dot)))
    return payload && typeof payload.cid === 'string' ? payload.cid : null
  } catch {
    return null
  }
}

function verify(token, expectedType, hmacInput) {
  const fail = { valid: false, customerId: null }
  try {
    const key = signingKey()
    if (!key || typeof token !== 'string' || token.length > 512) return fail
    const dot = token.indexOf('.')
    if (dot <= 0) return fail
    const payloadB64 = token.slice(0, dot)
    const sig = token.slice(dot + 1)
    const expected = hmac(hmacInput(payloadB64), key)
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return fail
    const payload = JSON.parse(fromB64url(payloadB64))
    if (!payload || payload.t !== expectedType || typeof payload.cid !== 'string') return fail
    if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return fail
    return { valid: true, customerId: payload.cid }
  } catch {
    return fail
  }
}
