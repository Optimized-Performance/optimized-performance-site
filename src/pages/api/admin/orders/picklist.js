// Aggregated pick list for the current "ready to ship" queue. Sums up
// vials needed by parent SKU across all paid + not-yet-shipped orders, so
// the packer can do one trip to the freezer/shelves per category instead
// of per order.
//
// Kit handling: kits don't exist in inventory — they're virtual products
// whose sale deducts N vials of the parent SKU. The pick list reflects
// reality: it shows vials by parent SKU, with annotations for how many of
// those vials are destined for kit assemblies vs. individual orders.
//
// Eligibility filter mirrors export-shipcheer.js exactly so both endpoints
// operate on the same queue.

import { supabaseAdmin } from '../../../../lib/supabase'
import { validateSessionToken } from '../../../../lib/session'
import { validateOrigin, rateLimit } from '../../../../lib/security'

function requireAuth(req) {
  const token = req.headers['x-admin-token']
  return validateSessionToken(token)
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 30, windowMs: 60000 })) {
    return res.status(429).json({ error: 'Too many requests' })
  }
  if (!requireAuth(req)) return res.status(401).json({ error: 'Unauthorized' })
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  try {
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('order_number, items, fulfillment_status, fraud_status')
      .eq('payment_status', 'completed')
      .is('tracking', null)
      .neq('fraud_status', 'blocked')
      .limit(500)
    if (error) throw error

    const eligible = (data || []).filter((o) => {
      const status = o.fulfillment_status || 'pending'
      return !['shipped', 'fulfilled', 'cancelled'].includes(status)
    })

    const products = require('../../../../data/products').default

    // Aggregate by parent SKU. For each parent SKU, track:
    //   - total vials needed (kits × vialCount + individual qty)
    //   - kit_count (how many of those vials are for kit assembly)
    //   - individual_count (vials shipping loose)
    //   - category, name, dosage (from product metadata for display)
    const agg = new Map()

    for (const order of eligible) {
      for (const item of order.items || []) {
        const product = products.find((p) => p.sku === item.sku || p.id === item.id)
        if (!product) continue

        const qty = Number(item.quantity) || 0
        if (qty < 1) continue

        const isKit = product.isKit === true
        const parent = isKit ? products.find((p) => p.id === product.parentId) : product
        if (!parent) continue

        const vialsForThisLine = isKit ? product.vialCount * qty : qty
        const key = parent.sku

        const existing = agg.get(key) || {
          sku: parent.sku,
          name: parent.name,
          dosage: parent.dosage,
          category: parent.category || 'Uncategorized',
          vials: 0,
          kit_count: 0,
          individual_count: 0,
        }
        existing.vials += vialsForThisLine
        if (isKit) existing.kit_count += qty
        else existing.individual_count += qty
        agg.set(key, existing)
      }
    }

    // Group by category. Categories sorted to match the catalog header order
    // shoppers (and the packer's mental model) see — keeps the picker's
    // walking path through inventory consistent.
    const categoryOrder = ['GLPs', 'GH Peptides', 'Peptides', 'Combos', 'Supplements', 'Uncategorized']
    const grouped = {}
    for (const item of agg.values()) {
      const cat = item.category
      grouped[cat] = grouped[cat] || []
      grouped[cat].push(item)
    }
    for (const cat of Object.keys(grouped)) {
      grouped[cat].sort((a, b) => a.name.localeCompare(b.name) || a.dosage.localeCompare(b.dosage))
    }

    const sortedGroups = categoryOrder
      .filter((c) => grouped[c])
      .map((c) => ({ category: c, items: grouped[c] }))
    // Append any uncategorized residuals at the end (shouldn't happen with
    // current catalog, but keeps the endpoint robust to new categories).
    for (const cat of Object.keys(grouped)) {
      if (!categoryOrder.includes(cat)) {
        sortedGroups.push({ category: cat, items: grouped[cat] })
      }
    }

    return res.status(200).json({
      order_count: eligible.length,
      total_vials: Array.from(agg.values()).reduce((sum, x) => sum + x.vials, 0),
      groups: sortedGroups,
      generated_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[orders/picklist]', err)
    return res.status(500).json({ error: err.message })
  }
}
