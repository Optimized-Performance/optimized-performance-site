// Admin broadcast composer — send a sale / new-item blast to a chosen segment.
// GET  -> { segments: {purchasers, newsletter, all}, history: [...] }
// POST -> { subject, body, segment } -> sends via sendMarketingBatch, logs it.
//
// Rides the marketing-email rail, so every send inherits suppression filtering,
// the one-click unsubscribe footer, and the authenticated marketing subdomain.

import { supabaseAdmin } from '../../../../lib/supabase'
import { validateSessionToken } from '../../../../lib/session'
import { validateOrigin, rateLimit } from '../../../../lib/security'
import { sendMarketingBatch } from '../../../../lib/marketing-email'

export const config = { maxDuration: 60 } // batch send can take a bit

const SEGMENTS = ['purchasers', 'newsletter', 'all']
const MAX_RECIPIENTS = 10000

function requireAuth(req) {
  return validateSessionToken(req.headers['x-admin-token'])
}

// Distinct completed-order customer emails.
async function purchaserEmails() {
  const { data } = await supabaseAdmin
    .from('orders')
    .select('customer_email')
    .eq('payment_status', 'completed')
    .not('customer_email', 'is', null)
    .limit(50000)
  const set = new Map()
  for (const o of data || []) {
    const e = String(o.customer_email).trim()
    if (e) set.set(e.toLowerCase(), e)
  }
  return [...set.values()]
}

async function newsletterEmails() {
  const { data } = await supabaseAdmin.from('newsletter_subscribers').select('email').limit(50000)
  const set = new Map()
  for (const r of data || []) {
    const e = String(r.email).trim()
    if (e) set.set(e.toLowerCase(), e)
  }
  return [...set.values()]
}

async function emailsForSegment(segment) {
  if (segment === 'purchasers') return purchaserEmails()
  if (segment === 'newsletter') return newsletterEmails()
  // all = union, deduped
  const [a, b] = await Promise.all([purchaserEmails(), newsletterEmails()])
  const set = new Map()
  for (const e of [...a, ...b]) set.set(e.toLowerCase(), e)
  return [...set.values()]
}

export default async function handler(req, res) {
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 20, windowMs: 60000 })) {
    return res.status(429).json({ error: 'Too many requests' })
  }
  if (!requireAuth(req)) return res.status(401).json({ error: 'Unauthorized' })
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  try {
    if (req.method === 'GET') {
      const [purchasers, newsletter] = await Promise.all([purchaserEmails(), newsletterEmails()])
      const allSet = new Set([...purchasers, ...newsletter].map((e) => e.toLowerCase()))
      const { data: history } = await supabaseAdmin
        .from('email_broadcasts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)
      return res.status(200).json({
        segments: { purchasers: purchasers.length, newsletter: newsletter.length, all: allSet.size },
        history: history || [],
      })
    }

    if (req.method === 'POST') {
      const { subject, body, segment } = req.body || {}
      if (!subject || typeof subject !== 'string' || subject.trim().length < 3) {
        return res.status(400).json({ error: 'Subject is required.' })
      }
      if (!body || typeof body !== 'string' || body.trim().length < 10) {
        return res.status(400).json({ error: 'Body is required (at least a sentence).' })
      }
      if (!SEGMENTS.includes(segment)) {
        return res.status(400).json({ error: 'Invalid segment.' })
      }

      const emails = await emailsForSegment(segment)
      if (emails.length === 0) return res.status(400).json({ error: 'That segment has no recipients.' })
      if (emails.length > MAX_RECIPIENTS) {
        return res.status(400).json({ error: `Segment has ${emails.length} recipients (cap ${MAX_RECIPIENTS}). Narrow it or raise the cap.` })
      }

      const bodyLines = String(body).split('\n')
      const result = await sendMarketingBatch({
        recipients: emails.map((email) => ({ email })),
        subject: subject.trim(),
        bodyLines,
      })

      if (!result.ok) {
        // e.g. no_postal_address — surface so the admin fixes env before sending.
        return res.status(400).json({ error: `Send blocked: ${result.reason}. Set MARKETING_POSTAL_ADDRESS + MARKETING_FROM_EMAIL.` })
      }

      await supabaseAdmin.from('email_broadcasts').insert({
        subject: subject.trim(),
        segment,
        recipient_count: result.recipients,
        sent_count: result.sent,
        suppressed_count: result.suppressed,
        failed_count: result.failed,
      })

      return res.status(200).json({ ok: true, ...result })
    }

    return res.status(405).end()
  } catch (err) {
    console.error('[admin/email/broadcast] error:', err)
    return res.status(500).json({ error: err.message })
  }
}
