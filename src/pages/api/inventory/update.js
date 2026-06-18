import { supabaseAdmin } from '../../../lib/supabase'
import { validateSessionToken } from '../../../lib/session'
import { validateOrigin, rateLimit } from '../../../lib/security'
import { getCatalog } from '../../../lib/catalog'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 30, windowMs: 60000 })) return res.status(429).json({ error: 'Too many requests' })

  try {
    const body = req.body

    // Admin panel bulk update: { token, updates: { productId: qty, ... } }
    if (body.token !== undefined) {
      if (!validateSessionToken(body.token)) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      if (body.updates && typeof body.updates === 'object') {
        const productsData = await getCatalog()
        const PRODUCT_BY_ID = new Map(productsData.map((p) => [p.id, p]))
        const MAX_STOCK = 1_000_000
        const entries = Object.entries(body.updates)
        for (const [productId, qty] of entries) {
          if (typeof productId !== 'string' || productId.length > 100) continue
          const n = Number(qty)
          if (!Number.isFinite(n) || n < 0 || n > MAX_STOCK) continue
          // UPSERT (not update) so a product that has no inventory row yet — e.g.
          // any SKU added after the original seed (BAC waters, tadalafil, MOTS-C…)
          // — gets created instead of silently no-op'ing back to 0. Catalog is the
          // source of truth for the metadata columns; threshold/reorder_threshold
          // are intentionally NOT set here so admin-tuned alert levels survive.
          const p = PRODUCT_BY_ID.get(productId)
          await supabaseAdmin
            .from('inventory')
            .upsert(
              {
                product_id: productId,
                stock: Math.floor(n),
                ...(p ? { sku: p.sku, product: p.name, price: p.price, size: p.dosage } : {}),
              },
              { onConflict: 'product_id' }
            )
        }
      }

      const { data: inventory, error } = await supabaseAdmin
        .from('inventory')
        .select('*')
        .order('product')

      if (error) throw error

      // Return in the format the admin page expects: { productId: qty, ... }
      const result = {}
      inventory.forEach(item => { result[item.product_id] = item.stock })
      return res.status(200).json(result)
    }

    // The legacy unauthenticated single-SKU `{ sku, quantity }` branch was
    // REMOVED 2026-06-08 (security pass): it decremented stock + fired alerts
    // with NO identity auth (origin+rate-limit only), so anyone could drain
    // inventory. It was also dead code — admin bulk updates use the token branch
    // above, and real fulfillment decrements stock via finalizePaidOrder, not
    // this route. Any caller without `token` is now rejected.
    return res.status(400).json({ error: 'Missing token (admin bulk update only)' })
  } catch (err) {
    console.error('Inventory update failed:', err)
    return res.status(500).json({ error: err.message })
  }
}
