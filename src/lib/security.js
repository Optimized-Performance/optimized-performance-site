// CSRF protection: validate origin/referer on POST requests
export function validateOrigin(req) {
  const origin = req.headers.origin || ''
  const referer = req.headers.referer || ''
  const host = req.headers.host || ''

  // Allow server-side calls (no origin/referer — internal API calls)
  if (!origin && !referer) return true

  // Check origin matches host
  if (origin) {
    try {
      const originHost = new URL(origin).host
      if (originHost === host) return true
    } catch { /* invalid URL */ }
    return false
  }

  // Check referer matches host
  if (referer) {
    try {
      const refererHost = new URL(referer).host
      if (refererHost === host) return true
    } catch { /* invalid URL */ }
    return false
  }

  return false
}

// Rate limiter: in-memory, per IP, configurable window
const rateLimitStore = new Map()
const CLEANUP_INTERVAL = 60 * 1000

// Clean up expired entries periodically
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of rateLimitStore) {
      if (now - entry.start > entry.window) rateLimitStore.delete(key)
    }
  }, CLEANUP_INTERVAL)
}

export function rateLimit(req, { maxRequests = 60, windowMs = 60 * 1000 } = {}) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'
  const key = ip + ':' + req.url
  const now = Date.now()

  const entry = rateLimitStore.get(key)
  if (!entry || now - entry.start > windowMs) {
    rateLimitStore.set(key, { count: 1, start: now, window: windowMs })
    return true
  }

  entry.count++
  if (entry.count > maxRequests) return false
  return true
}

// Input validation helpers
export function validateEmail(email) {
  // `_` and `%` are VALID in email local-parts (e.g. jane_doe@gmail.com), so we
  // must NOT reject them here — doing so 400s checkout ("Invalid or missing
  // required fields") for real customers on every rail. SQL LIKE-wildcard safety
  // is enforced at the QUERY layer instead: every `.ilike()` on an email wraps
  // the value in escapeLike() so `%`/`_` match literally, not as wildcards.
  return typeof email === 'string'
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    && email.length <= 254
}

// Escape SQL LIKE wildcards in any user-supplied value used with `.ilike()`/
// `.like()` so `%`/`_` are matched literally instead of as wildcards. Supabase
// uses backslash as the LIKE escape character.
export function escapeLike(str) {
  return String(str == null ? '' : str).replace(/([\\%_])/g, '\\$1')
}

export function validateString(str, { minLength = 1, maxLength = 500 } = {}) {
  return typeof str === 'string' && str.trim().length >= minLength && str.length <= maxLength
}

export function validateZip(zip) {
  // Accept US ZIP, ZIP+4 (hyphen OR space), and international postal codes.
  // Do NOT over-restrict to ^\d{5}(-\d{4})?$ — that 400s real customers at
  // checkout (ZIP+4 typed with a space "12345 6789", Canadian "K1A 0B1", UK
  // postcodes). Same revenue-killing class as the validateEmail _/% bug. This
  // is a sanity check only; address/shipping correctness is validated
  // downstream. 3–12 chars, alphanumeric with internal spaces/hyphens.
  if (typeof zip !== 'string') return false
  return /^[A-Za-z0-9][A-Za-z0-9 -]{1,10}[A-Za-z0-9]$/.test(zip.trim())
}

export function validatePositiveInt(val) {
  const n = Number(val)
  return Number.isInteger(n) && n > 0 && n < 100000
}
