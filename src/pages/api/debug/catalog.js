// TEMPORARY debug endpoint — REMOVE after diagnosing the catalog 500.
// Surfaces the real error that the prod-mode 500 page hides. Returns 200 with a
// JSON body either way so it's readable in a browser.
import { supabaseAdmin } from '../../../lib/supabase'
import { getCatalog } from '../../../lib/catalog'

export default async function handler(req, res) {
  const out = { hasAdmin: !!supabaseAdmin }
  try {
    const products = await getCatalog()
    out.ok = true
    out.count = products.length
    out.sample = products.slice(0, 2).map((p) => ({ id: p.id, price: p.price, tier: p.visibilityTier }))
  } catch (err) {
    out.ok = false
    out.error = err && err.message ? err.message : String(err)
    out.stack = (err && err.stack ? err.stack : '').split('\n').slice(0, 5)
  }
  return res.status(200).json(out)
}
