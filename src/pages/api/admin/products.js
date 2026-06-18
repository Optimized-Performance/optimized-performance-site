import { supabaseAdmin } from '../../../lib/supabase'
import { validateSessionToken } from '../../../lib/session'
import { validateOrigin, rateLimit } from '../../../lib/security'
import { getCatalog, invalidateCatalogCache } from '../../../lib/catalog'

// Admin catalog CRUD. Powers the Products tab (add/edit/disable, pricing,
// gating tier, rail policy) AND feeds the other admin tabs their product list.
// Auth mirrors the other admin endpoints (x-admin-token session).
//
// GET    -> full catalog (incl. unpublished/draft) via getCatalog()
// POST   -> create a SKU (defaults to unpublished + most-restrictive tier)
// PATCH  -> update a SKU by id (any subset of editable fields)
// There is NO hard delete — "disable" = PATCH { published: false }, so order
// history that references a SKU is never orphaned.

const TIERS = new Set(['public', 'cohort', 'account_gated'])
const RAILS = new Set(['all', 'p2p_crypto', 'zelle_crypto'])

// API (camelCase) -> column (snake_case). Only these fields are writable.
const FIELD_MAP = {
  sku: 'sku', name: 'name', description: 'description', dosage: 'dosage',
  price: 'price', category: 'category', format: 'format', vialSize: 'vial_size',
  inStock: 'in_stock', stock: 'stock', isKit: 'is_kit', parentId: 'parent_id',
  vialCount: 'vial_count', purity: 'purity', badge: 'badge', mw: 'mw',
  halfLife: 'half_life', reconShelfLife: 'recon_shelf_life', expiry: 'expiry',
  preorderShipDate: 'preorder_ship_date', visibilityTier: 'visibility_tier',
  railPolicy: 'rail_policy', hasCoa: 'has_coa', imageUrl: 'image_url',
  published: 'published', sortOrder: 'sort_order',
}

function requireAuth(req) {
  return validateSessionToken(req.headers['x-admin-token'])
}

// Build a validated column patch from a camelCase input body. Returns
// { patch } or { error }.
function buildPatch(body) {
  const patch = {}
  for (const [k, col] of Object.entries(FIELD_MAP)) {
    if (body[k] === undefined) continue
    let v = body[k]
    if (col === 'price') {
      v = Number(v)
      if (!Number.isFinite(v) || v <= 0) return { error: 'Price must be a positive number' }
      v = Math.round(v * 100) / 100
    } else if (col === 'visibility_tier') {
      if (!TIERS.has(v)) return { error: `visibility_tier must be one of: ${[...TIERS].join(', ')}` }
    } else if (col === 'rail_policy') {
      if (!RAILS.has(v)) return { error: `rail_policy must be one of: ${[...RAILS].join(', ')}` }
    } else if (['in_stock', 'is_kit', 'has_coa', 'published'].includes(col)) {
      v = !!v
    } else if (['stock', 'vial_count', 'sort_order'].includes(col)) {
      v = v == null || v === '' ? null : Math.trunc(Number(v))
      if (v != null && !Number.isFinite(v)) return { error: `${col} must be a number` }
    } else if (typeof v === 'string') {
      v = v.trim()
    }
    patch[col] = v
  }
  return { patch }
}

export default async function handler(req, res) {
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 60, windowMs: 60000 })) return res.status(429).json({ error: 'Too many requests' })
  if (!requireAuth(req)) return res.status(401).json({ error: 'Unauthorized' })
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  try {
    if (req.method === 'GET') {
      // Full catalog incl. drafts — admin needs to see/manage everything.
      const products = await getCatalog()
      return res.status(200).json({ products })
    }

    if (req.method === 'POST') {
      const body = req.body || {}
      const id = typeof body.id === 'string' ? body.id.trim() : ''
      if (!id) return res.status(400).json({ error: 'id (slug) is required' })
      const { patch, error } = buildPatch(body)
      if (error) return res.status(400).json({ error })
      if (!patch.sku) return res.status(400).json({ error: 'sku is required' })
      if (!patch.name) return res.status(400).json({ error: 'name is required' })
      if (patch.price == null) return res.status(400).json({ error: 'price is required' })
      const now = new Date().toISOString()
      const { data, error: dbErr } = await supabaseAdmin
        .from('products')
        .insert({ id, ...patch, created_at: now, updated_at: now })
        .select()
        .single()
      if (dbErr) {
        if (dbErr.code === '23505') return res.status(409).json({ error: 'A product with that id or sku already exists' })
        throw dbErr
      }
      invalidateCatalogCache()
      return res.status(201).json({ product: data })
    }

    if (req.method === 'PATCH') {
      const body = req.body || {}
      const id = typeof body.id === 'string' ? body.id.trim() : ''
      if (!id) return res.status(400).json({ error: 'id is required' })
      const { patch, error } = buildPatch(body)
      if (error) return res.status(400).json({ error })
      if (!Object.keys(patch).length) return res.status(400).json({ error: 'No editable fields supplied' })
      patch.updated_at = new Date().toISOString()
      const { data, error: dbErr } = await supabaseAdmin
        .from('products')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (dbErr) {
        if (dbErr.code === '23505') return res.status(409).json({ error: 'That sku is already in use' })
        throw dbErr
      }
      if (!data) return res.status(404).json({ error: 'Product not found' })
      invalidateCatalogCache()
      return res.status(200).json({ product: data })
    }

    return res.status(405).end()
  } catch (err) {
    console.error('[admin/products] error:', err)
    return res.status(500).json({ error: err.message })
  }
}
