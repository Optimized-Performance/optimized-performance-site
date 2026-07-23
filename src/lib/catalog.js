import { supabaseAdmin } from './supabase'

// Server-side catalog access — reads the `products` table (migrated out of
// src/data/products.js). Returns objects in the SAME camelCase shape the app
// already uses (vialSize, isKit, restricted, durableRailsOnly, noCoa, ...) so
// existing consumers keep working with minimal changes, PLUS the new fields
// (visibilityTier, railPolicy, imageUrl, published, sortOrder).
//
// Pricing stays server-authoritative: getProductById() is the lookup the order
// path validates price against — never trust a client-supplied price.
//
// Cached in-memory with a short TTL. Serverless = per-instance cache, so admin
// edits propagate within TTL_MS (or call invalidateCatalogCache() to force it).
// Deliberately NO setInterval — the TTL is checked on read, so nothing keeps a
// serverless instance alive (the rate-limiter timer lesson).

const TTL_MS = 30_000
let _cache = null
let _cacheTs = 0

// DB row (snake_case + new gating columns) -> app product shape (camelCase +
// the legacy boolean flags the existing code reads, derived from the new
// columns so downstream consumers need no rewrite).
function mapRow(r) {
  return {
    id: r.id,
    sku: r.sku,
    name: r.name,
    dosage: r.dosage,
    price: Number(r.price),
    description: r.description,
    category: r.category,
    format: r.format,
    vialSize: r.vial_size,
    inStock: r.in_stock,
    stock: r.stock,
    isKit: r.is_kit,
    parentId: r.parent_id,
    vialCount: r.vial_count,
    purity: r.purity,
    badge: r.badge,
    mw: r.mw,
    halfLife: r.half_life,
    reconShelfLife: r.recon_shelf_life,
    expiry: r.expiry,
    preorderShipDate: r.preorder_ship_date,
    // new catalog fields
    visibilityTier: r.visibility_tier,
    railPolicy: r.rail_policy,
    imageUrl: r.image_url,
    published: r.published,
    sortOrder: r.sort_order,
    // Purchase-approval gate — decoupled from visibility so a SKU can be openly
    // listed (public + crawlable) yet still require an approved-researcher account to
    // buy. Enforced server-side in /api/orders/create. Undefined (column not
    // yet migrated) → falsy → no gating, safe.
    purchaseApprovalRequired: r.purchase_approval_required === true,
    // back-compat derived flags — existing consumers keep using these
    restricted: r.visibility_tier !== 'public',
    durableRailsOnly: r.rail_policy !== 'all',
    noCoa: !r.has_coa,
  }
}

export function invalidateCatalogCache() {
  _cache = null
  _cacheTs = 0
}

// Full catalog (ALL rows, incl. unpublished) — SERVER ONLY. Used for by-id
// lookups (pricing/validation) and the admin Products tab. Never hand this
// directly to the client — use getVisibleCatalog().
export async function getCatalog() {
  if (_cache && Date.now() - _cacheTs < TTL_MS) return _cache
  if (!supabaseAdmin) throw new Error('[catalog] Supabase not configured')
  const { data, error } = await supabaseAdmin
    .from('products')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw error
  _cache = (data || []).map(mapRow)
  _cacheTs = Date.now()
  return _cache
}

// Authoritative single-product lookup by id OR sku. Includes unpublished so an
// in-flight order for a just-unpublished SKU still resolves its price.
export async function getProductById(idOrSku) {
  if (!idOrSku) return null
  const all = await getCatalog()
  return all.find((p) => p.id === idOrSku || p.sku === idOrSku) || null
}

// What a given requester may SEE. published-only, tier-filtered.
//   cohort      = request carries a valid ?ref cohort token
//   gatedAccess = authenticated customer on the allowlist (also sees cohort SKUs)
// This is the ONLY catalog a client should receive.
export async function getVisibleCatalog({ cohort = false, gatedAccess = false } = {}) {
  const all = await getCatalog()
  return all.filter((p) => {
    if (!p.published) return false
    if (p.visibilityTier === 'public') return true
    if (p.visibilityTier === 'cohort') return cohort || gatedAccess
    if (p.visibilityTier === 'account_gated') return gatedAccess
    return false
  })
}
