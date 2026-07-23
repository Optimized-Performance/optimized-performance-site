import crypto from 'crypto'

// Customer auth — mirrors lib/affiliate-session.js. Backs the
// account-required-to-purchase gate (NEXT_PUBLIC_REQUIRE_ACCOUNT). The session
// is a stateless HMAC token stored in an HttpOnly cookie, so it survives page
// refresh and can be verified server-side in /api/orders/create.
//
// Password hashing (scrypt) is shared with the affiliate system — re-exported
// here so customer callers have a single import surface.
export { hashPassword, verifyPassword } from './affiliate-session'

const SECRET = process.env.CUSTOMER_SESSION_SECRET || ''
// 90 days (was 30, bumped 2026-07-23): the research gate is now a login wall,
// so sessions must genuinely persist across visits — a lapsed cookie means the
// customer re-attests + signs in again. Rotate CUSTOMER_SESSION_SECRET to
// force-revoke all sessions.
const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000 // 90 days
export const CUSTOMER_COOKIE = 'opp_customer'
// Non-HttpOnly presence marker set/cleared ALONGSIDE the session cookie.
// Carries no data (literal "1") — it exists so pre-paint client code (the
// research-gate hide script in _document) and the AgeGate component can know
// a session exists without being able to read the HttpOnly token.
export const CUSTOMER_MARKER_COOKIE = 'opp_customer_present'

// Token format: <customerId>.<issuedAt>.<hmac>
//   hmac = HMAC-SHA256( SECRET, `${customerId}.${issuedAt}` )
//   Rotate CUSTOMER_SESSION_SECRET to revoke all sessions.
export function createCustomerToken(customerId) {
  if (!SECRET) throw new Error('CUSTOMER_SESSION_SECRET is not configured')
  if (!customerId || typeof customerId !== 'string') {
    throw new Error('createCustomerToken: customerId required')
  }
  const issuedAt = Date.now().toString()
  const payload = `${customerId}.${issuedAt}`
  const hmac = crypto.createHmac('sha256', SECRET).update(payload).digest('hex')
  return `${payload}.${hmac}`
}

export function validateCustomerToken(token) {
  if (!token || !SECRET) return null
  const parts = String(token).split('.')
  if (parts.length !== 3) return null
  const [customerId, issuedAt, hmac] = parts
  if (!customerId || !issuedAt || !hmac) return null

  const ts = parseInt(issuedAt, 10)
  if (!Number.isFinite(ts)) return null
  const age = Date.now() - ts
  if (age < 0 || age > TOKEN_TTL_MS) return null

  const expected = crypto
    .createHmac('sha256', SECRET)
    .update(`${customerId}.${issuedAt}`)
    .digest('hex')

  let a, b
  try {
    a = Buffer.from(hmac, 'hex')
    b = Buffer.from(expected, 'hex')
  } catch {
    return null
  }
  if (a.length !== b.length) return null
  try {
    if (!crypto.timingSafeEqual(a, b)) return null
  } catch {
    return null
  }
  return { customerId, issuedAt: ts }
}

const COOKIE_MAX_AGE = Math.floor(TOKEN_TTL_MS / 1000)

export function customerCookieHeader(token) {
  return `${CUSTOMER_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${COOKIE_MAX_AGE}`
}

export function clearCustomerCookieHeader() {
  return `${CUSTOMER_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`
}

export function customerMarkerCookieHeader() {
  return `${CUSTOMER_MARKER_COOKIE}=1; Path=/; SameSite=Lax; Secure; Max-Age=${COOKIE_MAX_AGE}`
}

export function clearCustomerMarkerCookieHeader() {
  return `${CUSTOMER_MARKER_COOKIE}=; Path=/; SameSite=Lax; Secure; Max-Age=0`
}

// Every sign-in path should set BOTH cookies (session + marker) — pass this
// array straight to res.setHeader('Set-Cookie', ...). Logout clears both.
export function customerSessionCookies(token) {
  return [customerCookieHeader(token), customerMarkerCookieHeader()]
}

export function clearCustomerSessionCookies() {
  return [clearCustomerCookieHeader(), clearCustomerMarkerCookieHeader()]
}

// Read + validate the customer session cookie from a Next.js API request.
// Returns the customerId string, or null if absent/invalid/expired.
export function getCustomerIdFromReq(req) {
  const token = req.cookies ? req.cookies[CUSTOMER_COOKIE] : null
  const v = validateCustomerToken(token)
  return v ? v.customerId : null
}
