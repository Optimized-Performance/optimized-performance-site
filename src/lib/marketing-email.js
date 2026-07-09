// Marketing-email transport — SERVER ONLY (node:crypto + supabaseAdmin).
//
// The layer every NON-transactional send goes through: replenishment nudges,
// sale/new-stock/new-item broadcasts. Responsibilities:
//   1. Suppression — never email an address on email_suppressions (unsubscribe
//      / bounce / complaint). Protects the sending domain's reputation and
//      keeps us CAN-SPAM compliant.
//   2. Footer — append a one-click unsubscribe link + physical postal address
//      (CAN-SPAM requires both) + the RUO line, on every marketing email.
//   3. Separate sending identity — sends FROM `MARKETING_FROM_EMAIL` (a distinct
//      subdomain, e.g. news@news.syngyn.co) so a
//      marketing reputation hit can't drag down transactional deliverability.
//
// Transactional mail (lib/alerts.js) intentionally does NOT use this — receipts
// and shipping notices aren't marketing and customers can't unsubscribe from them.

import crypto from 'crypto'
import { supabaseAdmin } from './supabase'
import { escapeLike } from './security'
import { renderBrandedEmail, escapeHtml } from './email-layout'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://syngyn.co'

// Distinct marketing sender — set this to the authenticated subdomain address.
// Falls back to the main domain so nothing breaks if unset, but DO set it
// before any broadcast so marketing reputation stays isolated from transactional.
const MARKETING_FROM = process.env.MARKETING_FROM_EMAIL || 'news@syngyn.co'
const MARKETING_FROM_NAME = process.env.MARKETING_FROM_NAME || 'Syngyn'
// CAN-SPAM requires a valid physical postal address in every marketing email.
// Set to OPP's registered business / PO address (NOT a home address).
const POSTAL_ADDRESS = process.env.MARKETING_POSTAL_ADDRESS || ''

function signingKey() {
  return process.env.MARKETING_TOKEN_SECRET || process.env.RECOVERY_TOKEN_SECRET || process.env.CRON_SECRET || ''
}
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function hmac(payloadB64, key) {
  return b64url(crypto.createHmac('sha256', key).update(payloadB64).digest())
}

// Unsubscribe token = HMAC over the (lowercased) email. No expiry — an
// unsubscribe link must work forever. Stateless, so no per-contact storage.
export function signUnsubscribeToken(email) {
  const key = signingKey()
  if (!key || !email) return null
  const payloadB64 = b64url(JSON.stringify({ e: String(email).trim().toLowerCase() }))
  return `${payloadB64}.${hmac(payloadB64, key)}`
}

// Returns the lowercased email if the token is authentic, else null.
export function verifyUnsubscribeToken(token) {
  try {
    const key = signingKey()
    if (!key || typeof token !== 'string' || token.length > 512) return null
    const dot = token.indexOf('.')
    if (dot <= 0) return null
    const payloadB64 = token.slice(0, dot)
    const sig = token.slice(dot + 1)
    const a = Buffer.from(sig)
    const b = Buffer.from(hmac(payloadB64, key))
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
    const payload = JSON.parse(Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
    return payload && typeof payload.e === 'string' ? payload.e : null
  } catch {
    return null
  }
}

export function unsubscribeUrl(email) {
  const token = signUnsubscribeToken(email)
  return token ? `${SITE_URL}/api/email/unsubscribe?u=${encodeURIComponent(token)}` : ''
}

// Record an unsubscribe / bounce / complaint. Idempotent (unique on lower(email)).
export async function suppressEmail(email, reason = 'unsubscribe') {
  if (!supabaseAdmin || !email) return false
  const { error } = await supabaseAdmin
    .from('email_suppressions')
    .insert({ email: String(email).trim(), reason })
  if (error && error.code !== '23505') {
    console.error('[marketing-email] suppress failed:', error.message)
    return false
  }
  return true
}

export async function isSuppressed(email) {
  if (!supabaseAdmin || !email) return false
  const { data } = await supabaseAdmin
    .from('email_suppressions')
    .select('id')
    .eq('email', String(email).trim().toLowerCase()) // index is on lower(email); stored values are sent lowercased? compare both
    .maybeSingle()
  if (data) return true
  // Fallback: case-insensitive match (stored value may not be pre-lowercased).
  const { data: ci } = await supabaseAdmin
    .from('email_suppressions')
    .select('id')
    .ilike('email', escapeLike(String(email).trim()))
    .maybeSingle()
  return !!ci
}

// Per-recipient compliance footer (one-click unsubscribe + postal address).
function footerLines(toEmail) {
  return [
    ``,
    `—`,
    `You're receiving this because you're a Syngyn customer.`,
    `Unsubscribe: ${unsubscribeUrl(toEmail)}`,
    POSTAL_ADDRESS ? POSTAL_ADDRESS : '',
    `For research use only.`,
  ].filter(Boolean)
}

// HTML variant of the compliance footer (trusted inline HTML for the branded
// shell's footerLines). Same CAN-SPAM content — unsubscribe link + postal
// address + RUO — just as an <a> instead of a bare URL.
function htmlFooterLines(toEmail) {
  const unsub = unsubscribeUrl(toEmail)
  return [
    `You're receiving this because you're a Syngyn customer.`,
    unsub ? `<a href="${unsub}" style="color:#8A8272;text-decoration:underline;">Unsubscribe</a>` : '',
    POSTAL_ADDRESS || '',
    `For research use only. Not for human consumption.`,
  ].filter(Boolean)
}

// Turn an admin-authored plain-text body into escaped HTML paragraphs: blank
// lines split paragraphs, single newlines become <br>. Escaped so nothing the
// admin types can break the markup.
function bodyToParagraphs(bodyLines) {
  return String(Array.isArray(bodyLines) ? bodyLines.join('\n') : bodyLines || '')
    .split(/\n\s*\n/)
    .map((chunk) => escapeHtml(chunk).replace(/\n/g, '<br>'))
    .filter(Boolean)
}

// Raw send — footer + SendGrid, NO suppression check (callers gate that). Never
// throws; returns a result so batch sends keep going.
async function sendOneMarketing({ toEmail, subject, bodyLines, branded = false, heading = '' }) {
  const apiKey = process.env.SENDGRID_API_KEY
  if (!apiKey) return { ok: false, reason: 'sendgrid_not_configured' }
  if (!toEmail) return { ok: false, reason: 'no_recipient' }
  if (!POSTAL_ADDRESS) return { ok: false, reason: 'no_postal_address' }

  const value = [...bodyLines, ...footerLines(toEmail)].join('\n')
  // Multipart: always send text/plain (deliverability + fallback). When branded,
  // ALSO attach a text/html part rendered in the Syngyn shell — same per-recipient
  // unsubscribe link, carried in the HTML footer.
  const content = [{ type: 'text/plain', value }]
  if (branded) {
    const html = renderBrandedEmail({
      preheader: subject,
      eyebrow: 'Syngyn',
      heading: heading || subject,
      paragraphs: bodyToParagraphs(bodyLines),
      footerLines: htmlFooterLines(toEmail),
    })
    content.push({ type: 'text/html', value: html })
  }
  // RFC 8058 one-click unsubscribe header — REQUIRED by Gmail/Yahoo bulk-sender
  // rules; missing it is a major spam-foldering factor for marketing mail. The
  // endpoint accepts the provider's POST (List-Unsubscribe=One-Click).
  const unsub = unsubscribeUrl(toEmail)
  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: toEmail }] }],
        from: { email: MARKETING_FROM, name: MARKETING_FROM_NAME },
        reply_to: { email: 'support@syngyn.co' },
        subject,
        content,
        // Click tracking OFF — SendGrid's branded-link SSL (url####.syngyn.co)
        // isn't provisioned, so tracked links throw a cert warning. No marketing
        // click-analytics wanted; keep it off in code, not just the dashboard.
        tracking_settings: { click_tracking: { enable: false, enable_text: false } },
        ...(unsub
          ? {
              headers: {
                'List-Unsubscribe': `<${unsub}>`,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
              },
            }
          : {}),
      }),
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      return { ok: false, reason: `sendgrid_${res.status}`, detail: t.slice(0, 200) }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: 'send_error', detail: err.message }
  }
}

// Send one marketing email (single recipient) — checks suppression first. Used
// by triggered sends (replenishment, back-in-stock).
export async function sendMarketingEmail({ toEmail, subject, bodyLines }) {
  if (!toEmail) return { ok: false, reason: 'no_recipient' }
  if (await isSuppressed(toEmail)) return { ok: false, reason: 'suppressed' }
  return sendOneMarketing({ toEmail, subject, bodyLines })
}

// Load the whole suppression list as a lowercased Set — one query for a batch
// instead of two per recipient.
async function getSuppressedSet() {
  const set = new Set()
  if (!supabaseAdmin) return set
  const { data } = await supabaseAdmin.from('email_suppressions').select('email').limit(100000)
  for (const r of data || []) set.add(String(r.email).trim().toLowerCase())
  return set
}

// Send a broadcast to many recipients. `recipients` = [{ email }]. Bulk-filters
// suppressions once, dedupes, then sends with bounded concurrency so a few
// hundred recipients finish well inside the function timeout. Each recipient
// still gets their own unsubscribe footer. Returns counts.
export async function sendMarketingBatch({ recipients, subject, bodyLines, branded = false, heading = '', concurrency = 12 }) {
  if (!POSTAL_ADDRESS) return { ok: false, reason: 'no_postal_address' }
  const suppressed = await getSuppressedSet()

  // Dedupe + drop suppressed/invalid.
  const seen = new Set()
  const queue = []
  let suppressedCount = 0
  for (const r of recipients || []) {
    const email = String(r?.email || '').trim()
    const lower = email.toLowerCase()
    if (!email || !email.includes('@') || seen.has(lower)) continue
    seen.add(lower)
    if (suppressed.has(lower)) { suppressedCount += 1; continue }
    queue.push(email)
  }

  let sent = 0
  let failed = 0
  let idx = 0
  async function worker() {
    while (idx < queue.length) {
      const email = queue[idx++]
      const r = await sendOneMarketing({ toEmail: email, subject, bodyLines, branded, heading })
      if (r.ok) sent += 1
      else failed += 1
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker))

  return { ok: true, recipients: seen.size, eligible: queue.length, sent, failed, suppressed: suppressedCount }
}
