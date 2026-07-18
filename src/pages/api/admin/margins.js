import { supabaseAdmin } from '../../../lib/supabase'
import { validateSessionToken } from '../../../lib/session'
import { validateOrigin, rateLimit } from '../../../lib/security'
import { getCatalog } from '../../../lib/catalog'
import { PRODUCT_COST, COGS_PCT } from '../../../lib/takehome-config'

// Per-SKU margin table for the admin Margins tab (Tris visibility). GROSS
// margin per product: retail price vs vendor cost (the PRODUCT_COST map that
// drives affiliate COGS / take-home; unmapped SKUs fall back to COGS_PCT of
// retail and are flagged 'estimated'). This is product-level list margin,
// BEFORE order-level processing/shipping/commission — the blended realized net
// is the Analytics take-home panel. Read-only, admin-gated.

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

function requireAuth(req) {
  return validateSessionToken(req.headers['x-admin-token'])
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 60, windowMs: 60000 })) return res.status(429).json({ error: 'Too many requests' })
  if (!requireAuth(req)) return res.status(401).json({ error: 'Unauthorized' })
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  try {
    const catalog = await getCatalog()

    const rows = catalog
      .filter((p) => Number(p.price) > 0 && !p.isKit) // real sellable units, not virtual kits
      .map((p) => {
        const price = round2(p.price)
        const mapped = PRODUCT_COST[p.id] != null
        const cost = round2(mapped ? Number(PRODUCT_COST[p.id]) : price * COGS_PCT)
        const gp = round2(price - cost)
        const marginPct = price > 0 ? Math.round((gp / price) * 1000) / 10 : 0
        return {
          id: p.id,
          name: p.dosage ? `${p.name} ${p.dosage}` : p.name,
          category: p.category || 'Uncategorized',
          published: p.published !== false,
          price,
          cost,
          costSource: mapped ? 'mapped' : 'estimated',
          gp,
          marginPct,
        }
      })
      .sort((a, b) => a.marginPct - b.marginPct) // thinnest margin first — the ones to watch

    // Summary + per-category averages.
    const n = rows.length
    const avgMargin = n ? Math.round((rows.reduce((s, r) => s + r.marginPct, 0) / n) * 10) / 10 : 0
    const catMap = new Map()
    for (const r of rows) {
      const c = catMap.get(r.category) || { category: r.category, count: 0, marginSum: 0 }
      c.count += 1
      c.marginSum += r.marginPct
      catMap.set(r.category, c)
    }
    const byCategory = Array.from(catMap.values())
      .map((c) => ({ category: c.category, count: c.count, avgMargin: Math.round((c.marginSum / c.count) * 10) / 10 }))
      .sort((a, b) => a.avgMargin - b.avgMargin)

    return res.status(200).json({
      rows,
      summary: {
        count: n,
        avgMargin,
        lowest: rows[0] ? { name: rows[0].name, marginPct: rows[0].marginPct } : null,
        highest: rows[n - 1] ? { name: rows[n - 1].name, marginPct: rows[n - 1].marginPct } : null,
        estimatedCount: rows.filter((r) => r.costSource === 'estimated').length,
      },
      byCategory,
    })
  } catch (err) {
    console.error('[margins]', err)
    return res.status(500).json({ error: err.message })
  }
}
