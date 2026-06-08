import { supabaseAdmin } from '../../../lib/supabase'
import { validateSessionToken } from '../../../lib/session'
import { validateOrigin, rateLimit } from '../../../lib/security'

// Payment funnel / fall-off analytics. Reads the orders table and reports,
// per rail and per affiliate code, how many checkout attempts COMPLETED payment
// vs FELL OFF (abandoned). Built to answer "how many people fall off from credit
// card payment issues" — the instant rails (card/PayPal/crypto) create an order
// row at checkout (payment_status='awaiting_payment') and the expire cron flips
// it to 'abandoned' after 48h if never captured. Manual rails (zelle/venmo) sit
// 'pending' until an admin marks them paid — they don't auto-abandon, so their
// "fall-off" isn't directly captured here (see UI caveat).

function requireAuth(req) {
  return validateSessionToken(req.headers['x-admin-token'])
}

const RAILS = ['card', 'paypal', 'crypto', 'zelle', 'venmo']
// The "credit card stuff" rails where processor/card friction shows up.
const CARD_RAILS = ['card', 'paypal']

function emptyBucket() {
  return { attempts: 0, completed: 0, abandoned: 0, awaiting: 0, pending: 0, refunded: 0 }
}

function classify(bucket, status) {
  bucket.attempts += 1
  if (status === 'completed') bucket.completed += 1
  else if (status === 'refunded') bucket.refunded += 1
  else if (status === 'abandoned') bucket.abandoned += 1
  else if (status === 'awaiting_payment') bucket.awaiting += 1
  else if (status === 'pending') bucket.pending += 1
}

// completion = paid / resolved. "paid" = completed + refunded (they DID complete
// payment; a refund is a later event). "resolved" = paid + abandoned, i.e. only
// attempts that reached a terminal outcome — excludes awaiting (still in flight)
// and pending (manual deposit / fraud review, not a clean fall-off).
function rates(b) {
  const paid = b.completed + b.refunded
  const resolved = paid + b.abandoned
  return {
    ...b,
    paid,
    resolved,
    completionRate: resolved > 0 ? paid / resolved : null,
    fallOffRate: resolved > 0 ? b.abandoned / resolved : null,
  }
}

export default async function handler(req, res) {
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 60, windowMs: 60000 })) {
    return res.status(429).json({ error: 'Too many requests' })
  }
  if (!requireAuth(req)) return res.status(401).json({ error: 'Unauthorized' })
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const days = parseInt(req.query.days, 10)
    let query = supabaseAdmin
      .from('orders')
      .select('payment_status, payment_method, affiliate_code, customer_email')
      .order('created_at', { ascending: false })
      .limit(10000)
    if (Number.isFinite(days) && days > 0) {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
      query = query.gte('created_at', cutoff)
    }
    const { data, error } = await query
    if (error) throw error
    const orders = data || []

    const byRail = {}
    for (const r of RAILS) byRail[r] = emptyBucket()
    const sitewide = emptyBucket()
    const cardRails = emptyBucket()
    const affMap = {}

    // Exclude test orders (e.g. the founder's own checkout testing) so they
    // don't skew completion/fall-off — especially on small affiliate codes.
    // Set FUNNEL_EXCLUDE_EMAILS in env (comma-separated emails).
    const excludeEmails = new Set((process.env.FUNNEL_EXCLUDE_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean))
    let excludedCount = 0

    for (const o of orders) {
      if (o.customer_email && excludeEmails.has(o.customer_email.toLowerCase())) { excludedCount += 1; continue }
      const status = o.payment_status
      const rail = RAILS.includes(o.payment_method) ? o.payment_method : 'other'
      if (!byRail[rail]) byRail[rail] = emptyBucket()
      classify(byRail[rail], status)
      classify(sitewide, status)
      const isCard = CARD_RAILS.includes(o.payment_method)
      if (isCard) classify(cardRails, status)

      const code = o.affiliate_code || '(direct)'
      if (!affMap[code]) affMap[code] = { code, all: emptyBucket(), card: emptyBucket() }
      classify(affMap[code].all, status)
      if (isCard) classify(affMap[code].card, status)
    }

    const railRates = {}
    for (const [r, b] of Object.entries(byRail)) railRates[r] = rates(b)

    const byAffiliate = Object.values(affMap)
      .map((a) => ({ code: a.code, all: rates(a.all), card: rates(a.card) }))
      .sort((x, y) => y.all.attempts - x.all.attempts)

    return res.status(200).json({
      window: Number.isFinite(days) && days > 0 ? `${days}d` : 'all',
      total_orders: orders.length - excludedCount,
      excluded_count: excludedCount,
      sitewide: rates(sitewide),
      cardRails: rates(cardRails),
      byRail: railRates,
      byAffiliate,
    })
  } catch (e) {
    console.error('Funnel query failed:', e)
    return res.status(500).json({ error: 'Query failed' })
  }
}
