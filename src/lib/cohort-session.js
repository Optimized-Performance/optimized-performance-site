import crypto from 'crypto'
import { verifyRecoveryToken } from './recovery'
import { RECOVERY_COOKIE, RECOVERY_QUERY_PARAM } from './recovery-config'

// =========================================
// Cohort gate — referral-token-aware catalog visibility
// =========================================
//
// Replaces the binary NEXT_PUBLIC_HIDE_RESTRICTED env flag with a per-session
// signed cookie. Public unreferred URL → restricted-hidden catalog (Square's
// AUP-scanning view). URL with valid referral token (?ref=CODE / ?cohort=TOKEN)
// → full catalog including GLP-3 + HGH 191AA.
//
// The cookie is a stateless HMAC over a version tag + issued-at timestamp.
// We don't store WHICH token granted access — just that A valid token did.
// To revoke all cohort cookies, rotate COHORT_SESSION_SECRET.
//
// Threat model: this is obfuscation against automated AUP scanners, not
// authentication. A determined investigator who finds an affiliate link
// posted publicly can get past the gate. See COHORT-GATE-CONTEXT.md.

const SECRET = process.env.COHORT_SESSION_SECRET || process.env.AFFILIATE_SESSION_SECRET || ''
const COOKIE_NAME = 'opp_cohort'
const COOKIE_TTL_DAYS = 90
const COOKIE_TTL_MS = COOKIE_TTL_DAYS * 24 * 60 * 60 * 1000
const TOKEN_VERSION = 'v1'

// Admin-managed cohort allowlist. Anything in here unlocks the catalog when
// passed via ?cohort=. Affiliate codes from the affiliates table are validated
// separately via a DB lookup in getCohortFromRequest below.
//
// Add cohort identifiers as needed (one-off campaigns, partner drops, etc.).
// Keep the list short — every entry is a stable URL someone could share.
const COHORT_ALLOWLIST = new Set([
  'tris-community',
  'tris-launch',
  'telegram',
  'launch',
  'community',
  'broadcast',
  'social',
])

export function isCohortAllowedToken(token) {
  if (!token || typeof token !== 'string') return false
  return COHORT_ALLOWLIST.has(token.toLowerCase().trim())
}

// Sign + serialize a cohort cookie value. Stateless HMAC — to verify, we
// recompute and timing-safe-compare.
function createCookieValue() {
  if (!SECRET) {
    throw new Error('COHORT_SESSION_SECRET (or AFFILIATE_SESSION_SECRET fallback) is not configured')
  }
  const issuedAt = Date.now().toString()
  const payload = `${TOKEN_VERSION}.${issuedAt}`
  const hmac = crypto.createHmac('sha256', SECRET).update(payload).digest('hex')
  return `${payload}.${hmac}`
}

function isCookieValueValid(value) {
  if (!value || !SECRET) return false
  const parts = String(value).split('.')
  if (parts.length !== 3) return false
  const [version, issuedAt, hmac] = parts
  if (version !== TOKEN_VERSION) return false
  const ts = parseInt(issuedAt, 10)
  if (!Number.isFinite(ts)) return false
  const age = Date.now() - ts
  if (age < 0 || age > COOKIE_TTL_MS) return false
  const expected = crypto
    .createHmac('sha256', SECRET)
    .update(`${version}.${issuedAt}`)
    .digest('hex')
  let a, b
  try {
    a = Buffer.from(hmac, 'hex')
    b = Buffer.from(expected, 'hex')
  } catch {
    return false
  }
  if (a.length !== b.length) return false
  try {
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

function parseCookies(cookieHeader) {
  const out = {}
  if (!cookieHeader) return out
  String(cookieHeader)
    .split(';')
    .forEach((part) => {
      const idx = part.indexOf('=')
      if (idx < 0) return
      const k = part.slice(0, idx).trim()
      const v = part.slice(idx + 1).trim()
      if (k) out[k] = decodeURIComponent(v)
    })
  return out
}

function buildSetCookieHeader(value, { secure = true } = {}) {
  const maxAge = Math.floor(COOKIE_TTL_MS / 1000)
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'SameSite=Lax',
    'HttpOnly',
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

// Companion cookie carrying the affiliate CODE for checkout attribution.
// NOT HttpOnly — checkout.js reads it client-side to pre-fill the affiliate
// code input. Tampering doesn't matter: the code is validated server-side at
// order create against the affiliates table, so a forged opp_ref cookie just
// fails validation and gets dropped. Same 90-day TTL as the cohort cookie.
function buildRefCookieHeader(code, { secure = true } = {}) {
  const maxAge = Math.floor(COOKIE_TTL_MS / 1000)
  const parts = [
    `opp_ref=${encodeURIComponent(code)}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'SameSite=Lax',
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

// Companion cookie carrying the recovery TOKEN so the 5%-off recovery link
// survives the landing-page → shop → checkout navigation (checkout.js reads it
// client-side, then re-validates server-side at order create). Not HttpOnly —
// like opp_ref, tampering is harmless: the token is HMAC-verified server-side,
// a forged one just fails and grants no discount. TTL matches the token's 7-day
// life rather than the 90-day cohort TTL.
const RECOVERY_COOKIE_TTL_MS = 7 * 24 * 60 * 60 * 1000
function buildRecoverCookieHeader(token, { secure = true } = {}) {
  const maxAge = Math.floor(RECOVERY_COOKIE_TTL_MS / 1000)
  const parts = [
    `${RECOVERY_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'SameSite=Lax',
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

// Append a Set-Cookie header without clobbering any other Set-Cookie the
// caller (Next.js, downstream handlers) may already have written.
function appendSetCookie(res, cookie) {
  if (!res || !res.setHeader) return
  const existing = res.getHeader('Set-Cookie')
  if (!existing) {
    res.setHeader('Set-Cookie', cookie)
  } else if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookie])
  } else {
    res.setHeader('Set-Cookie', [String(existing), cookie])
  }
}

// =========================================
// Public API — call from getServerSideProps
// =========================================
//
// Usage:
//   const { cohortAllowed } = await getCohortFromRequest(context)
//
// Behavior (in this order — query params win over existing cookie so a
// returning visitor clicking a fresh affiliate link gets opp_ref refreshed
// even when their opp_cohort cookie is already valid):
//   1. ?cohort=TOKEN matches the in-memory allowlist → set/refresh
//      opp_cohort, cohortAllowed=true.
//   2. ?ref=CODE matches an active affiliate → set/refresh BOTH opp_cohort
//      and opp_ref, cohortAllowed=true. opp_ref carries the code for
//      checkout attribution.
//   3. Existing valid opp_cohort cookie → cohortAllowed=true (no cookie
//      writes needed).
//   4. None of the above → cohortAllowed=false. Public catalog rendered.
//
// supabaseAdmin is passed in so this module stays import-cycle-free; callers
// already have the admin client handy.
export async function getCohortFromRequest(context, supabaseAdmin) {
  const { req, res, query } = context
  const cookies = parseCookies(req?.headers?.cookie)

  // Recovery link (?recover=TOKEN). Persist the token to a cookie so the 5%-off
  // discount follows the customer from this landing page through checkout, and
  // treat a valid token as a cohort-unlock credential below (the customer was
  // already in-cohort when they placed the order it nudges). Set the cookie up
  // front so it lands even if a cohort/ref param wins the early return.
  const recoverParam = typeof query?.[RECOVERY_QUERY_PARAM] === 'string' ? query[RECOVERY_QUERY_PARAM] : null
  const recoverValid = !!(recoverParam && verifyRecoveryToken(recoverParam).valid)
  if (recoverValid) appendSetCookie(res, buildRecoverCookieHeader(recoverParam))

  const cohortParam = typeof query?.cohort === 'string' ? query.cohort : null
  if (cohortParam && isCohortAllowedToken(cohortParam)) {
    appendSetCookie(res, buildSetCookieHeader(createCookieValue()))
    return { cohortAllowed: true, source: 'cohort_param' }
  }

  const refParam = typeof query?.ref === 'string' ? query.ref : null
  if (refParam && supabaseAdmin) {
    const code = refParam.toUpperCase().trim().slice(0, 50)
    if (code) {
      try {
        const { data } = await supabaseAdmin
          .from('affiliates')
          .select('code')
          .eq('code', code)
          .eq('active', true)
          .maybeSingle()
        if (data) {
          // Two cookies: opp_cohort unlocks the catalog (HttpOnly, signed),
          // opp_ref carries the affiliate code for checkout attribution
          // (JS-readable, plain). Checkout.js reads opp_ref client-side to
          // pre-fill the affiliate code input so the customer doesn't have
          // to type it manually for the affiliate to get commission.
          appendSetCookie(res, buildSetCookieHeader(createCookieValue()))
          appendSetCookie(res, buildRefCookieHeader(data.code))
          return { cohortAllowed: true, source: 'ref_param', refCode: data.code }
        }
      } catch (err) {
        // Don't fail the page render if the lookup blows up — fall through to
        // unflagged. Bot scanners shouldn't be hitting ?ref= anyway.
        console.warn('[cohort-session] affiliate lookup failed:', err.message)
      }
    }
  }

  // A valid recovery token unlocks the catalog on its own (when no cohort/ref
  // param already returned above) — set the cohort cookie so the rest of the
  // session works normally.
  if (recoverValid) {
    appendSetCookie(res, buildSetCookieHeader(createCookieValue()))
    return { cohortAllowed: true, source: 'recover_param' }
  }

  if (cookies[COOKIE_NAME] && isCookieValueValid(cookies[COOKIE_NAME])) {
    return { cohortAllowed: true, source: 'cookie' }
  }

  return { cohortAllowed: false, source: 'none' }
}

// Test-only / admin-tooling export. Lets ops force-set a cohort cookie from
// an authenticated admin endpoint without going through the normal flow.
export function setCohortCookieResponse(res) {
  appendSetCookie(res, buildSetCookieHeader(createCookieValue()))
}

export const COHORT_COOKIE_NAME = COOKIE_NAME
