import Busboy from 'busboy'
import { supabaseAdmin } from '../../lib/supabase'
import {
  classifyEmail,
  generateReply,
  AUTO_REPLY_CLASSIFICATIONS,
  ARCHIVE_CLASSIFICATIONS,
  ESCALATE_CLASSIFICATIONS,
  statusForClassification,
} from '../../lib/email-bot'
import { sendCustomerReply } from '../../lib/alerts'

// Webhook handler for SendGrid Inbound Parse on bot@inbound.optimizedperformancepeptides.com.
// Flow: parse → store raw → classify (Claude) → look up related order → auto-reply OR draft.
//
// Auth: shared secret in URL query — set INBOUND_EMAIL_TOKEN on Vercel and append
// ?token=<value> to the SendGrid Destination URL. SendGrid Inbound Parse doesn't
// natively sign webhooks, so a URL token is the practical approach.
//
// Spam: SendGrid's spam_score arrives as a form field. We hard-archive anything
// scoring > 5.0 before calling Claude (saves API tokens on garbage).

export const config = {
  api: { bodyParser: false }, // multipart, parsed manually below
}

const SPAM_HARD_CUTOFF = 5.0

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const fields = {}
    const bb = Busboy({ headers: req.headers, limits: { fileSize: 25 * 1024 * 1024 } })
    bb.on('field', (name, val) => {
      // SendGrid posts duplicate field names sometimes; concat into array if so
      if (fields[name] !== undefined) {
        fields[name] = Array.isArray(fields[name]) ? [...fields[name], val] : [fields[name], val]
      } else {
        fields[name] = val
      }
    })
    bb.on('file', (name, file) => {
      // Drain attachment streams without storing — v1 doesn't process attachments.
      file.resume()
    })
    bb.on('finish', () => resolve(fields))
    bb.on('error', reject)
    req.pipe(bb)
  })
}

function pickFirst(v) {
  return Array.isArray(v) ? v[0] : v
}

// Extract the bare email + display name from a "Display Name <email@domain>" header.
function parseAddress(raw) {
  const s = String(raw || '').trim()
  const angle = s.match(/^(.*?)<([^>]+)>\s*$/)
  if (angle) {
    return { name: angle[1].trim().replace(/^"|"$/g, ''), email: angle[2].trim().toLowerCase() }
  }
  return { name: '', email: s.toLowerCase() }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  // Token check
  const expected = process.env.INBOUND_EMAIL_TOKEN
  if (expected) {
    if (req.query.token !== expected) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  } else {
    console.warn('[inbound-email] INBOUND_EMAIL_TOKEN not set — webhook is open')
  }

  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  let fields
  try {
    fields = await parseMultipart(req)
  } catch (err) {
    console.error('[inbound-email] multipart parse failed:', err)
    return res.status(400).json({ error: 'Could not parse multipart form' })
  }

  const fromRaw = pickFirst(fields.from)
  const toRaw = pickFirst(fields.to)
  const subject = pickFirst(fields.subject) || ''
  const bodyText = pickFirst(fields.text) || ''
  const bodyHtml = pickFirst(fields.html) || ''
  const spamScoreRaw = pickFirst(fields.spam_score)
  const spamScore = Number.isFinite(Number(spamScoreRaw)) ? Number(spamScoreRaw) : null

  const { name: fromName, email: fromEmail } = parseAddress(fromRaw)
  if (!fromEmail) {
    return res.status(400).json({ error: 'Missing from address' })
  }

  // Hard spam cutoff — bypass Claude entirely
  if (spamScore !== null && spamScore >= SPAM_HARD_CUTOFF) {
    const { data: spamRow } = await supabaseAdmin
      .from('inbound_emails')
      .insert({
        from_email: fromEmail,
        from_name: fromName || null,
        to_email: parseAddress(toRaw).email || null,
        subject,
        body_text: bodyText.slice(0, 100000),
        body_html: bodyHtml.slice(0, 200000),
        spam_score: spamScore,
        classification: 'spam',
        classification_reason: `SendGrid spam_score=${spamScore} >= ${SPAM_HARD_CUTOFF}`,
        status: 'spam',
        processed_at: new Date().toISOString(),
      })
      .select()
      .single()
    return res.status(200).json({ ok: true, id: spamRow?.id, status: 'spam' })
  }

  // Insert pending row first so we have an id even if classification fails
  const { data: row, error: insertErr } = await supabaseAdmin
    .from('inbound_emails')
    .insert({
      from_email: fromEmail,
      from_name: fromName || null,
      to_email: parseAddress(toRaw).email || null,
      subject,
      body_text: bodyText.slice(0, 100000),
      body_html: bodyHtml.slice(0, 200000),
      spam_score: spamScore,
      status: 'new',
    })
    .select()
    .single()
  if (insertErr) {
    console.error('[inbound-email] insert failed:', insertErr)
    return res.status(500).json({ error: 'DB insert failed' })
  }

  // Always return 200 to SendGrid quickly; classification + reply happen async-ish.
  // SendGrid retries on non-2xx, so taking too long here causes duplicate inserts.
  // We finish processing inline because Vercel serverless has no background queue,
  // but if Claude is slow we still ack 200 above the 30s SendGrid timeout. Practical
  // p99 is ~3-5s for classify + reply, so inline is fine.

  let classificationResult
  try {
    classificationResult = await classifyEmail({
      from_email: fromEmail, from_name: fromName, subject, body_text: bodyText,
    })
  } catch (err) {
    console.error('[inbound-email] classification failed:', err)
    await supabaseAdmin.from('inbound_emails').update({
      classification: 'other',
      classification_reason: `Classification error: ${err.message}`,
      status: 'new',
      processed_at: new Date().toISOString(),
    }).eq('id', row.id)
    return res.status(200).json({ ok: true, id: row.id, status: 'classification_failed' })
  }

  const { classification, reason: classReason, order_number } = classificationResult

  // Look up the related order if mentioned
  let order = null
  if (order_number) {
    const { data } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, customer_name, customer_email, fulfillment_status, payment_status, items, total, tracking, shipped_at')
      .eq('order_number', order_number)
      .single()
    if (data) order = data
  }
  // Fallback: try to find by customer_email
  if (!order && fromEmail) {
    const { data } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, customer_name, customer_email, fulfillment_status, payment_status, items, total, tracking, shipped_at')
      .eq('customer_email', fromEmail)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) order = data
  }

  const targetStatus = statusForClassification(classification)
  const updatePatch = {
    classification,
    classification_reason: classReason,
    related_order_number: order?.order_number || order_number || null,
    status: targetStatus,
    processed_at: new Date().toISOString(),
  }

  // Spam / escalate paths — no reply generation
  if (ARCHIVE_CLASSIFICATIONS.includes(classification) || ESCALATE_CLASSIFICATIONS.includes(classification)) {
    await supabaseAdmin.from('inbound_emails').update(updatePatch).eq('id', row.id)
    return res.status(200).json({ ok: true, id: row.id, status: targetStatus })
  }

  // Generate the reply (auto or draft)
  let draft
  try {
    draft = await generateReply(
      { from_email: fromEmail, from_name: fromName, subject, body_text: bodyText },
      { classification, order }
    )
  } catch (err) {
    console.error('[inbound-email] reply generation failed:', err)
    updatePatch.status = 'new'  // back to new so admin sees it
    updatePatch.classification_reason = `${classReason} | Reply gen error: ${err.message}`
    await supabaseAdmin.from('inbound_emails').update(updatePatch).eq('id', row.id)
    return res.status(200).json({ ok: true, id: row.id, status: 'reply_failed' })
  }

  updatePatch.reply_subject = draft.subject
  updatePatch.reply_body = draft.body

  // Auto-send for the auto-reply buckets
  if (AUTO_REPLY_CLASSIFICATIONS.includes(classification)) {
    try {
      await sendCustomerReply({
        to_email: fromEmail,
        subject: draft.subject,
        body: draft.body,
      })
      updatePatch.reply_sent_at = new Date().toISOString()
    } catch (err) {
      console.error('[inbound-email] auto-reply send failed:', err)
      updatePatch.status = 'draft_pending'  // fall back to draft for admin to send manually
      updatePatch.classification_reason = `${classReason} | Auto-send failed: ${err.message}`
    }
  }

  await supabaseAdmin.from('inbound_emails').update(updatePatch).eq('id', row.id)
  return res.status(200).json({ ok: true, id: row.id, status: updatePatch.status })
}
