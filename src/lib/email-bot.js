// Email-bot helpers. Two responsibilities:
//   1. classifyEmail(email)        — call Claude API, return { classification, reason, order_number }
//   2. generateReply(email, ctx)   — call Claude API, return { subject, body } for the drafted reply
//
// Calls Anthropic's REST endpoint directly via fetch (no SDK install needed).
// Uses Sonnet 4.6 for both calls — same model the Telegram bot uses.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-6'

async function callClaude({ system, messages, max_tokens = 1024, temperature = 0 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured')

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, system, messages, max_tokens, temperature }),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Anthropic API error ${res.status}: ${errText.slice(0, 500)}`)
  }
  const data = await res.json()
  const text = data?.content?.[0]?.text || ''
  return { text, raw: data }
}

const CLASSIFY_SYSTEM = `You are a triage bot for Optimized Performance Inc., a research peptide company. You read incoming customer emails and classify them into one of these buckets:

- order_status: Customer asking about an existing order's status (where is my order, when will it ship, has it shipped, etc.)
- tracking: Customer asking for the tracking number or trying to track a shipment
- refund_request: Customer asking for a refund, return, complaint about product, or threat to dispute
- partnership: Affiliate inquiries, business partnership requests, supplier offers, B2B questions
- legal_compliance: Anything mentioning lawyers, lawsuits, FDA, FTC, regulatory bodies, subpoenas, cease-and-desist, formal complaints, or threats. ALSO: anything that smells like coordinated regulatory pressure.
- spam: Marketing pitches, SEO services, fake B2B, irrelevant content, obvious spam
- other: Anything that doesn't fit the above (general questions, product info requests, gratitude, etc.)

Output ONLY a single JSON object with these fields, no other text:
{
  "classification": "<one of the buckets above>",
  "reason": "<brief 1-sentence explanation>",
  "order_number": "<the OP-XXXX-XXXX order number if mentioned, else null>"
}

If the email is in a language other than English, classify as best you can and note in reason.
If you cannot classify, use "other" and explain in reason.`

const REPLY_SYSTEM = `You are drafting a customer service reply for Optimized Performance Inc., a research peptide company. The brand voice is "common folk helping common folk" — plainspoken, direct, no corporate fluff. Short paragraphs.

Hard rules:
- All products are research-use-only (RUO). Never imply or condone human use.
- Never make medical, therapeutic, or outcome claims.
- Never promise a refund, discount, or credit unless the inbound email already establishes a clear case for it (defective product, wrong item, lost shipment) — otherwise say "we'd like to look into this" and route to admin.
- Never share other customers' info, internal pricing logic, processor names, or affiliate program internals.
- If the customer threatens a chargeback, gently steer them toward direct refund: "we can refund directly faster than your bank can process the dispute, please give us a chance to fix it first."
- Sign off as "— OPP Customer Service" (no individual names).
- Keep it under 200 words unless the situation requires more.

Output ONLY a single JSON object, no other text:
{
  "subject": "<reply subject — usually 'Re: <their subject>'>",
  "body": "<plain text reply body — no HTML, paragraph breaks with \\n\\n>"
}`

function safeJsonParse(text) {
  // Handle responses that wrap JSON in code fences or extra prose
  const trimmed = String(text || '').trim()
  // Try direct parse first
  try { return JSON.parse(trimmed) } catch { /* fall through */ }
  // Strip markdown fences
  const fenceStripped = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  try { return JSON.parse(fenceStripped) } catch { /* fall through */ }
  // Find first { and matching } as a last resort
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try { return JSON.parse(trimmed.slice(start, end + 1)) } catch { /* fall through */ }
  }
  return null
}

export async function classifyEmail(email) {
  const userMsg = [
    `From: ${email.from_email || '(unknown)'}${email.from_name ? ` "${email.from_name}"` : ''}`,
    `Subject: ${email.subject || '(no subject)'}`,
    '',
    String(email.body_text || '').slice(0, 6000),
  ].join('\n')

  const { text } = await callClaude({
    system: CLASSIFY_SYSTEM,
    messages: [{ role: 'user', content: userMsg }],
    max_tokens: 256,
  })

  const parsed = safeJsonParse(text)
  if (!parsed || !parsed.classification) {
    return { classification: 'other', reason: 'Bot returned unparseable classification', order_number: null, raw: text }
  }
  return {
    classification: String(parsed.classification),
    reason: String(parsed.reason || ''),
    order_number: parsed.order_number || null,
  }
}

export async function generateReply(email, context) {
  // context: { classification, order, tracking_url }
  const orderBlock = context?.order
    ? [
        `RELATED ORDER (use this in your reply if helpful):`,
        `- Order number: ${context.order.order_number}`,
        `- Customer: ${context.order.customer_name} (${context.order.customer_email})`,
        `- Order status: ${context.order.fulfillment_status || 'pending'}`,
        `- Payment: ${context.order.payment_status || 'pending'}`,
        `- Items: ${(context.order.items || []).map((i) => `${i.name || i.sku} x${i.quantity}`).join(', ')}`,
        `- Total: $${Number(context.order.total || 0).toFixed(2)}`,
        `- Tracking: ${context.order.tracking || '(not yet shipped)'}`,
        context.tracking_url ? `- Tracking URL: ${context.tracking_url}` : '',
        `- Shipped at: ${context.order.shipped_at || '(not yet)'}`,
      ].filter(Boolean).join('\n')
    : 'NO RELATED ORDER FOUND. Ask the customer for an order number if relevant.'

  const userMsg = [
    `INBOUND EMAIL:`,
    `From: ${email.from_email}${email.from_name ? ` "${email.from_name}"` : ''}`,
    `Subject: ${email.subject || '(no subject)'}`,
    '',
    String(email.body_text || '').slice(0, 6000),
    '',
    '---',
    `BOT CLASSIFICATION: ${context.classification}`,
    '',
    orderBlock,
    '',
    `Draft a reply now.`,
  ].join('\n')

  const { text } = await callClaude({
    system: REPLY_SYSTEM,
    messages: [{ role: 'user', content: userMsg }],
    max_tokens: 1024,
    temperature: 0.3,
  })

  const parsed = safeJsonParse(text)
  if (!parsed || !parsed.body) {
    return {
      subject: `Re: ${email.subject || 'your message'}`,
      body: 'Thanks for reaching out — we received your message and will follow up shortly.\n\n— OPP Customer Service',
    }
  }
  return {
    subject: String(parsed.subject || `Re: ${email.subject || 'your message'}`),
    body: String(parsed.body),
  }
}

// Buckets that get auto-replied without admin review:
export const AUTO_REPLY_CLASSIFICATIONS = ['order_status', 'tracking']

// Buckets that get drafted but await admin approval:
export const DRAFT_CLASSIFICATIONS = ['refund_request', 'partnership', 'other']

// Buckets that get flagged but no auto-action:
export const ESCALATE_CLASSIFICATIONS = ['legal_compliance']

// Buckets that get archived:
export const ARCHIVE_CLASSIFICATIONS = ['spam']

export function statusForClassification(classification) {
  if (AUTO_REPLY_CLASSIFICATIONS.includes(classification)) return 'auto_replied'
  if (DRAFT_CLASSIFICATIONS.includes(classification)) return 'draft_pending'
  if (ESCALATE_CLASSIFICATIONS.includes(classification)) return 'escalated'
  if (ARCHIVE_CLASSIFICATIONS.includes(classification)) return 'spam'
  return 'new'
}
