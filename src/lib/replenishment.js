import { supabaseAdmin } from './supabase'
import { sendMarketingEmail } from './marketing-email'
import { signRecoveryToken } from './recovery'
import { RECOVERY_DISCOUNT_PCT } from './recovery-config'
import { cycleDaysFor, GRACE_DAYS } from './replenishment-config'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://optimizedperformancepeptides.com'

// How far back to scan completed orders to find each customer's most-recent
// purchase of each product. Must comfortably exceed the longest cycle + grace.
const LOOKBACK_DAYS = 120
// The recovery-discount link in the nudge expires in 3 days — urgency, and it
// stops customers being conditioned to expect a standing discount on reorders.
const OFFER_TTL_DAYS = 3
const DAY_MS = 24 * 60 * 60 * 1000

// "Running low?" replenishment nudge. For each (customer, product), if their
// most-recent completed purchase of that product is now [cycle, cycle+grace]
// days old (i.e. they're about due to reorder) and we haven't nudged them for
// it this cycle, email a time-limited 5%-off reorder link. One nudge per
// customer per run (their most-overdue product) so nobody gets a stack of
// emails. Idempotent via replenishment_nudges. Returns a structured run log.
//
// Used by: /api/cron/replenishment (daily Vercel cron + manual CRON_SECRET).
export async function runReplenishmentNudges({ preview = false } = {}) {
  const log = { started_at: new Date().toISOString(), candidates: 0, nudges_sent: 0, skipped_suppressed: 0, errors: [] }
  if (preview) { log.preview = []; log.would_send = 0 }

  // Master enable gate — ships OFF so the cron is inert until you've stood up
  // the marketing subdomain (MARKETING_FROM_EMAIL), set the postal address, and
  // reviewed the copy. Flip REPLENISHMENT_ENABLED=true to go live. Preview mode
  // bypasses the gate (it never sends) so you can inspect the would-send list
  // BEFORE enabling.
  if (!preview && process.env.REPLENISHMENT_ENABLED !== 'true') {
    log.disabled = true
    log.finished_at = new Date().toISOString()
    return log
  }

  if (!supabaseAdmin) {
    log.errors.push({ fatal: 'Database not configured' })
    log.finished_at = new Date().toISOString()
    return log
  }
  if (!signRecoveryToken()) {
    log.errors.push({ fatal: 'No signing key (set RECOVERY_TOKEN_SECRET or CRON_SECRET) — reorder links would be dead' })
    log.finished_at = new Date().toISOString()
    return log
  }

  try {
    const now = Date.now()
    const lookbackCutoff = new Date(now - LOOKBACK_DAYS * DAY_MS).toISOString()

    const { data: orders, error } = await supabaseAdmin
      .from('orders')
      .select('customer_email, customer_name, items, created_at')
      .eq('payment_status', 'completed')
      .gte('created_at', lookbackCutoff)
      .not('customer_email', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5000)
    if (error) throw error

    // Build per-(email, product) most-recent purchase. Iterating newest-first
    // means the first time we see a pair is its latest purchase.
    const latest = new Map() // key `${emailLower}|${productId}` -> { email, name, productId, productName, date }
    for (const o of orders || []) {
      const emailLower = String(o.customer_email).trim().toLowerCase()
      const date = new Date(o.created_at).getTime()
      for (const it of Array.isArray(o.items) ? o.items : []) {
        const productId = it.id || it.sku
        if (!productId) continue
        const key = `${emailLower}|${productId}`
        if (!latest.has(key)) {
          latest.set(key, { email: o.customer_email, name: o.customer_name, productId, productName: it.name || productId, date })
        }
      }
    }

    // Find due pairs; keep the single most-overdue product per customer.
    const dueByEmail = new Map() // emailLower -> best candidate
    for (const c of latest.values()) {
      const cycle = cycleDaysFor(c.productId)
      if (!cycle || cycle <= 0) continue // excluded product
      const ageDays = (now - c.date) / DAY_MS
      if (ageDays < cycle || ageDays > cycle + GRACE_DAYS) continue // not in the due window
      const emailLower = c.email.trim().toLowerCase()
      const overdue = ageDays - cycle
      const cur = dueByEmail.get(emailLower)
      if (!cur || overdue > cur.overdue) dueByEmail.set(emailLower, { ...c, overdue })
    }

    log.candidates = dueByEmail.size

    for (const c of dueByEmail.values()) {
      try {
        // Idempotency: already nudged for this product since its last purchase?
        const { data: prior } = await supabaseAdmin
          .from('replenishment_nudges')
          .select('id')
          .eq('email', c.email.trim().toLowerCase())
          .eq('product_id', c.productId)
          .gte('sent_at', new Date(c.date).toISOString())
          .limit(1)
          .maybeSingle()
        if (prior) continue

        const token = signRecoveryToken({ ttlDays: OFFER_TTL_DAYS })
        const reorderUrl = `${SITE_URL}/products/${encodeURIComponent(c.productId)}?recover=${encodeURIComponent(token)}`

        // Preview: record who WOULD be emailed (and the real URL) without
        // sending or stamping, so the list can be reviewed before going live.
        if (preview) {
          log.would_send += 1
          if (log.preview.length < 200) {
            log.preview.push({ email: c.email, product: c.productName, age_days: Math.round((now - c.date) / DAY_MS), url: reorderUrl })
          }
          continue
        }

        const first = (c.name || '').trim().split(/\s+/)[0]

        const bodyLines = [
          first ? `Hey ${first},` : `Hey,`,
          ``,
          `Based on your last order, you're probably about to run low on ${c.productName}.`,
          ``,
          `To make the reorder easy, grab it in the next ${OFFER_TTL_DAYS} days and we'll apply`,
          `your best discount automatically — an extra ${RECOVERY_DISCOUNT_PCT}% off, or your`,
          `affiliate code if it saves you more — when you click through:`,
          ``,
          `Reorder ${c.productName}: ${reorderUrl}`,
          ``,
          `Already restocked? Ignore this — we'll check back next cycle.`,
        ]

        const result = await sendMarketingEmail({
          toEmail: c.email,
          subject: `Running low on ${c.productName}? ${RECOVERY_DISCOUNT_PCT}% off to restock`,
          bodyLines,
        })

        if (result.ok) {
          await supabaseAdmin.from('replenishment_nudges').insert({ email: c.email.trim().toLowerCase(), product_id: c.productId })
          log.nudges_sent += 1
        } else if (result.reason === 'suppressed') {
          log.skipped_suppressed += 1
        } else {
          log.errors.push({ email: c.email, reason: result.reason, detail: result.detail })
        }
      } catch (perErr) {
        log.errors.push({ email: c.email, error: perErr.message })
      }
    }
  } catch (err) {
    console.error('[replenishment] fatal:', err)
    log.errors.push({ fatal: err.message })
  }

  log.finished_at = new Date().toISOString()
  return log
}
