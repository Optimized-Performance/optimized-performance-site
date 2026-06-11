// Recovery-token signing + verification — SERVER ONLY (uses node:crypto).
// Import only from API routes / cron / getServerSideProps, never from client
// components. Client-safe constants live in lib/recovery-config.js.
//
// The token authorizes the recovery discount (see RECOVERY_DISCOUNT_PCT). It is
// a compact, self-contained, HMAC-signed blob — NOT stored server-side — so the
// hourly cron can mint one per nudged order with no DB round-trip, and any page
// can verify it statelessly. It proves only "issued by us + not expired"; the
// discount % is fixed server-side, so a holder can't escalate it.
//
// Format:  base64url(payloadJSON) + "." + base64url(hmacSHA256)
//   payload = { exp: <ms epoch>, ord?: <order_number> }
//
// `ord` (optional) ties the token to the abandoned order so the site can
// rebuild the exact cart on arrival (see /api/recovery/cart). Replenishment
// links mint without it — those land on a PDP, no cart rebuild wanted.
//
// Signing key: RECOVERY_TOKEN_SECRET, falling back to CRON_SECRET (already set
// in the Vercel env for the other crons) so the rail works without a new env
// var. If neither is configured, sign/verify fail closed (no token issued, no
// discount granted) rather than minting forgeable tokens.

import crypto from 'crypto'
import { RECOVERY_DISCOUNT_PCT } from './recovery-config'

const DEFAULT_TTL_DAYS = 7

function signingKey() {
  return process.env.RECOVERY_TOKEN_SECRET || process.env.CRON_SECRET || ''
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function hmac(payloadB64, key) {
  return b64url(crypto.createHmac('sha256', key).update(payloadB64).digest())
}

// Mint a recovery token valid for `ttlDays`. Returns null when no signing key is
// configured so callers can skip sending a worthless link instead of emailing a
// broken one.
export function signRecoveryToken({ ttlDays = DEFAULT_TTL_DAYS, orderNumber = null } = {}) {
  const key = signingKey()
  if (!key) return null
  const exp = Date.now() + ttlDays * 24 * 60 * 60 * 1000
  const payload = orderNumber ? { exp, ord: String(orderNumber) } : { exp }
  const payloadB64 = b64url(JSON.stringify(payload))
  return `${payloadB64}.${hmac(payloadB64, key)}`
}

// Verify a token's signature + expiry. Returns { valid, pct, orderNumber } —
// pct is the server-authoritative RECOVERY_DISCOUNT_PCT (never read from the
// token), 0 when invalid; orderNumber is the bound order or null for tokens
// minted without one (replenishment). Constant-time compare; never throws.
export function verifyRecoveryToken(token) {
  const fail = { valid: false, pct: 0, orderNumber: null }
  try {
    const key = signingKey()
    if (!key || typeof token !== 'string' || token.length > 512) return fail
    const dot = token.indexOf('.')
    if (dot <= 0) return fail
    const payloadB64 = token.slice(0, dot)
    const sig = token.slice(dot + 1)
    const expected = hmac(payloadB64, key)
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return fail
    const payload = JSON.parse(Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
    if (!payload || typeof payload.exp !== 'number' || Date.now() > payload.exp) return fail
    return {
      valid: true,
      pct: RECOVERY_DISCOUNT_PCT,
      orderNumber: typeof payload.ord === 'string' ? payload.ord : null,
    }
  } catch {
    return fail
  }
}
