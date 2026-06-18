// Velocity-based fraud checks. Run server-side before order insertion in
// /api/orders/create. Returns { status, reasons } where status is one of:
//
//   'allow' — proceed normally (default for clean orders)
//   'flag'  — insert with fraud_status='flagged', allow payment, admin reviews
//   'block' — insert with fraud_status='blocked', NO payment session created,
//             return a verification-required error to the client
//
// Velocity windows match the schema-level indexes in supabase-migration-v10.sql.

import { supabaseAdmin } from './supabase'

const HARD_VELOCITY_HOURS = 24
const SOFT_VELOCITY_DAYS = 30
const RECENT_FETCH_LIMIT = 200

// Same residential address from multiple identities is the #1 fraud signal in
// e-commerce — card testing, reshipper rings, package-mule networks. We're
// strict on the 24h window (block) and softer on 30d (flag for review).
const REASON_ADDRESS_HARD = 'address_velocity_24h_other_identity'
const REASON_ADDRESS_SOFT = 'address_velocity_30d_other_identity'
const REASON_IP_VELOCITY = 'ip_velocity_24h_multi_address'
const REASON_EMAIL_PATTERN = 'email_pattern_low_trust'
const REASON_CHECK_ERROR = 'velocity_check_error'

// Email domains where firstname+lastname-only-letters local parts are a known
// synthetic-identity pattern. Real customers' emails skew messier.
const SUSPECT_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
])

export function normalizeAddress(addr, city, state, zip) {
  const parts = [addr, city, state, zip].map((s) =>
    String(s || '').toLowerCase().trim().replace(/\s+/g, ' ')
  )
  return parts.join('|')
}

export function isLowTrustEmailPattern(email) {
  if (!email || typeof email !== 'string') return false
  const lower = email.toLowerCase().trim()
  const at = lower.indexOf('@')
  if (at < 1) return false
  const local = lower.slice(0, at)
  const domain = lower.slice(at + 1)
  if (!SUSPECT_EMAIL_DOMAINS.has(domain)) return false
  // Local part is letters only (no digits, no dots, no plus) and 6–24 chars.
  return /^[a-z]+$/.test(local) && local.length >= 6 && local.length <= 24
}

export function extractClientIP(req) {
  if (!req || !req.headers) return null
  const xff = req.headers['x-forwarded-for']
  if (xff) {
    const first = String(xff).split(',')[0].trim()
    if (first) return first
  }
  const xri = req.headers['x-real-ip']
  if (xri) return String(xri).trim()
  return req.socket?.remoteAddress || null
}

function escalate(current, next) {
  // Severity ladder: allow < flag < block. Never downgrade.
  if (current === 'block') return 'block'
  if (next === 'block') return 'block'
  if (current === 'flag' || next === 'flag') return 'flag'
  return 'allow'
}

export async function runVelocityChecks({
  email,
  address,
  city,
  state,
  zip,
  ip,
}) {
  const reasons = []
  let status = 'allow'

  if (!supabaseAdmin) {
    return { status, reasons }
  }

  const normalized = normalizeAddress(address, city, state, zip)
  const lowerEmail = String(email || '').toLowerCase().trim()
  const now = Date.now()
  const hardCutoff = new Date(now - HARD_VELOCITY_HOURS * 3600 * 1000).toISOString()
  const softCutoff = new Date(now - SOFT_VELOCITY_DAYS * 86400 * 1000).toISOString()

  // Address velocity. We pull the recent window once and filter in memory —
  // simpler than parameterized SQL and fine at current order volume. If
  // recent-window rows ever exceed RECENT_FETCH_LIMIT, swap for an indexed
  // lookup against idx_orders_address_velocity.
  try {
    const { data: recent } = await supabaseAdmin
      .from('orders')
      .select('customer_email, shipping_address, city, state, zip, customer_ip, created_at')
      .gte('created_at', softCutoff)
      .order('created_at', { ascending: false })
      .limit(RECENT_FETCH_LIMIT)

    if (Array.isArray(recent)) {
      const sameAddress = recent.filter(
        (o) => normalizeAddress(o.shipping_address, o.city, o.state, o.zip) === normalized
      )

      const otherIdentityHits = sameAddress.filter(
        (o) => String(o.customer_email || '').toLowerCase().trim() !== lowerEmail
      )

      if (otherIdentityHits.length > 0) {
        // Count DISTINCT other identities (emails), not order rows, inside the
        // 24h window. 2+ different identities shipping to one address in a day
        // is the classic card-testing / reshipper-ring pattern → block. A
        // SINGLE other identity is far more often benign — a household, a gift,
        // or a customer who fixed a typo'd email and re-ordered — so flag it
        // for review instead of blocking a likely-real sale at checkout.
        const distinctHardIdentities = new Set(
          otherIdentityHits
            .filter((o) => o.created_at >= hardCutoff)
            .map((o) => String(o.customer_email || '').toLowerCase().trim())
        )
        if (distinctHardIdentities.size >= 2) {
          reasons.push(REASON_ADDRESS_HARD)
          status = escalate(status, 'block')
        } else {
          reasons.push(REASON_ADDRESS_SOFT)
          status = escalate(status, 'flag')
        }
      }

      // IP velocity. 2+ distinct addresses from this IP in the hard window
      // (excluding the current address) is a fraud-ring signal. Single-IP +
      // single-address with multiple orders is fine — that's just a customer
      // re-ordering.
      if (ip) {
        const sameIPHardWindow = recent.filter(
          (o) => o.customer_ip === ip && o.created_at >= hardCutoff
        )
        const distinctAddresses = new Set(
          sameIPHardWindow.map((o) =>
            normalizeAddress(o.shipping_address, o.city, o.state, o.zip)
          )
        )
        distinctAddresses.delete(normalized)
        if (distinctAddresses.size >= 2) {
          reasons.push(REASON_IP_VELOCITY)
          status = escalate(status, 'flag')
        }
      }
    }
  } catch (err) {
    // Velocity-check failure shouldn't block legitimate orders — fail safe to
    // a flag so admin sees we couldn't verify, rather than dropping the sale.
    console.error('[fraud-checks] velocity query failed:', err?.message)
    reasons.push(REASON_CHECK_ERROR)
    status = escalate(status, 'flag')
  }

  // Email-pattern is a WEAK signal: a letters-only local part on a major
  // provider (e.g. johnsmith@gmail.com) describes an enormous number of real
  // customers, so on its own it produces mostly false positives — and at volume
  // a noisy flag trains the reviewer to clear everything, which hides the real
  // hits. Use it only to CORROBORATE: it escalates to a flag exclusively when
  // another velocity signal already fired, sharpening that signal rather than
  // flagging clean orders. (When reasons only contains a velocity_check_error,
  // status is already 'flag', so this is a no-op there.)
  if (isLowTrustEmailPattern(email) && reasons.length > 0) {
    reasons.push(REASON_EMAIL_PATTERN)
    status = escalate(status, 'flag')
  }

  return { status, reasons }
}
