import { supabaseAdmin } from '../../../lib/supabase'
import { validateSessionToken } from '../../../lib/session'
import { validateOrigin, rateLimit } from '../../../lib/security'
import { getCatalog } from '../../../lib/catalog'
import { PRODUCT_COST, COGS_PCT } from '../../../lib/takehome-config'

// Held-inventory valuation for the Supply Tracker. Values the physical lots in
// `supply_lots` (a tracking ledger that is SEPARATE from the sellable
// `inventory` table — nothing here is purchasable) so Matt/Tris can see how
// much product is sitting on the shelf, split by:
//   - HELD (awaiting testing) = lots with coa_on_file = false
//   - VERIFIED (COA on file)  = lots with coa_on_file = true
//
// Retail = qty × catalog price (per vial). Cost = qty × PRODUCT_COST[id]
// (the same vendor-cost map that drives affiliate COGS / take-home), falling
// back to COGS_PCT × retail for unmapped SKUs. Uses qty_remaining = what's
// actually still on hand.
//
// Read-only. Admin-gated like the rest of the admin API.

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
    const { data: lots, error } = await supabaseAdmin
      .from('supply_lots')
      .select('product_id, qty_vials, qty_remaining, coa_on_file')
    if (error) throw error

    const catalog = await getCatalog()
    const byId = new Map(catalog.map((p) => [p.id, p]))

    // Aggregate into held (awaiting testing) vs verified, plus a per-product
    // breakdown of the HELD bucket so the value is legible/auditable.
    const blank = () => ({ vials: 0, retail: 0, cost: 0 })
    const held = blank()
    const verified = blank()
    const heldByProduct = new Map()

    for (const lot of lots || []) {
      const qty = Number(lot.qty_remaining ?? lot.qty_vials) || 0
      if (qty <= 0) continue
      const product = byId.get(lot.product_id)
      const retailEach = Number(product?.price) || 0
      const costEach = PRODUCT_COST[lot.product_id] != null
        ? Number(PRODUCT_COST[lot.product_id])
        : retailEach * COGS_PCT
      const retail = qty * retailEach
      const cost = qty * costEach
      const bucket = lot.coa_on_file ? verified : held
      bucket.vials += qty
      bucket.retail += retail
      bucket.cost += cost

      if (!lot.coa_on_file) {
        const key = lot.product_id
        const row = heldByProduct.get(key) || {
          id: key,
          name: product ? `${product.name}${product.dosage ? ` ${product.dosage}` : ''}` : key,
          vials: 0, retail: 0, cost: 0,
        }
        row.vials += qty
        row.retail += retail
        row.cost += cost
        heldByProduct.set(key, row)
      }
    }

    const finalize = (b) => ({ vials: b.vials, retail: round2(b.retail), cost: round2(b.cost) })
    const total = {
      vials: held.vials + verified.vials,
      retail: round2(held.retail + verified.retail),
      cost: round2(held.cost + verified.cost),
    }

    return res.status(200).json({
      held: finalize(held),
      verified: finalize(verified),
      total,
      heldByProduct: Array.from(heldByProduct.values())
        .map((r) => ({ ...r, retail: round2(r.retail), cost: round2(r.cost) }))
        .sort((a, b) => b.retail - a.retail),
    })
  } catch (err) {
    console.error('[inventory-value]', err)
    return res.status(500).json({ error: err.message })
  }
}
