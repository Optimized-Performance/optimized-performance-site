// Memorial Day weekend sale — 2026.
//
// Site-wide auto-applied discount (no promo code) + free shipping override
// for the long-weekend window. Stacks multiplicatively with affiliate codes:
// affiliate discount applies to the sale-discounted subtotal, not the
// original retail. Affiliate commission continues to be calculated on the
// amount actually paid (post-all-discounts), which is the standard
// commission model.
//
// Single source of truth — imported by:
//   - lib/shipping.js (free shipping override)
//   - pages/api/orders/create.js (server-side total calc, authoritative)
//   - pages/checkout.js (client-side cart total display)
//   - components/ProductCard.js (strikethrough pricing on cards)
//   - pages/products/[id].js (strikethrough pricing on PDPs)
//   - components/MemorialDayBanner.js (banner visibility)

// Window: Saturday May 23 2026 through Monday May 25 2026, Pacific Time.
//
// CRITICAL: window MUST be defined in UTC explicitly so that client (browser
// in customer's local TZ) and server (Vercel runs in UTC) evaluate the same
// instant. Earlier version used `new Date(year, month, day, ...)` which
// builds in *local* time — that produced a 7-hour discrepancy between client
// (PT) and server (UTC): late-evening Pacific Time orders saw "MD active"
// on the client cart but "MD inactive" on the server's order creation,
// leading to PayPal popups showing the undiscounted price and customers
// either bailing (Corey 4-attempt loop) or paying overcharged amounts
// (Corey OP-20260526-50V8 paid $476.68 instead of $405.18, a $71.50
// overcharge).
//
// Sale boundaries pinned to Pacific Time as the canonical timezone (where
// OPP operates from). PDT in May = UTC-7, so:
//   start: 5/23 00:00 PT = 5/23 07:00 UTC
//   end:   5/25 23:59:59.999 PT = 5/26 06:59:59.999 UTC
const SALE_START_YEAR = 2026
const SALE_START_MONTH_INDEX = 4 // May (0-indexed)
const SALE_START_DAY = 23
const SALE_END_YEAR = 2026
const SALE_END_MONTH_INDEX = 4
const SALE_END_DAY = 25
// Pacific Time offset from UTC during PDT (May falls within PDT each year).
const PT_UTC_OFFSET_HOURS = 7

export const MEMORIAL_DAY_DISCOUNT_PCT = 15

function saleStart() {
  // 5/23 00:00 PT = 5/23 07:00 UTC
  return new Date(Date.UTC(
    SALE_START_YEAR,
    SALE_START_MONTH_INDEX,
    SALE_START_DAY,
    PT_UTC_OFFSET_HOURS, 0, 0, 0
  ))
}
function saleEnd() {
  // 5/25 23:59:59.999 PT = 5/26 06:59:59.999 UTC (end of 5/25 in PT,
  // which is 7 hours into 5/26 UTC).
  return new Date(Date.UTC(
    SALE_END_YEAR,
    SALE_END_MONTH_INDEX,
    SALE_END_DAY + 1,
    PT_UTC_OFFSET_HOURS - 1, 59, 59, 999
  ))
}

export function isMemorialDaySaleActive(now = new Date()) {
  const t = now.getTime()
  return t >= saleStart().getTime() && t <= saleEnd().getTime()
}

// Apply the Memorial Day discount to a subtotal. Returns { discount, post }
// where post = subtotal - discount. Returns zero discount if sale inactive,
// so callers can call unconditionally.
export function applyMemorialDiscount(subtotal, now = new Date()) {
  if (!isMemorialDaySaleActive(now)) {
    return { discount: 0, post: subtotal }
  }
  const discount = subtotal * (MEMORIAL_DAY_DISCOUNT_PCT / 100)
  return { discount, post: subtotal - discount }
}

// Single-price discount (for strikethrough pricing on product cards / PDPs).
// Returns the sale price if active, else the original.
export function getSalePrice(originalPrice, now = new Date()) {
  if (!isMemorialDaySaleActive(now)) return originalPrice
  return originalPrice * (1 - MEMORIAL_DAY_DISCOUNT_PCT / 100)
}

// Formatted-string helper for human-facing copy.
export function saleWindowLabel() {
  // "Sat May 23 — Mon May 25" — used in banner + product card strikethrough subline.
  return 'MAY 23 — MAY 25'
}

// ============================================================
// GLP-3 "Buy 2 Get 1 Free" promo — 2026.
// ============================================================
// Same-mg B2G1 on GLP-3 SINGLE vials only (glp3-10mg, glp3-20mg). Kits excluded
// by design. For every 3 units of an eligible single SKU, 1 is free
// (floor(qty / 3) free vials per SKU, computed per-SKU so 10mg and 20mg don't
// cross-subsidize). Stacks with affiliate codes the same way MD did: the B2G1
// dollar discount comes off the subtotal first, then the affiliate % applies to
// the post-promo subtotal.
//
// Window: Fri May 29 2026 00:00 PT → Fri Jun 5 2026 23:59:59 PT (one week).
// MUST be pinned in explicit UTC (same hard lesson as the MD window above) so
// the client (customer-TZ browser) and server (UTC Vercel) evaluate the same
// instant — otherwise late-PT carts disagree with server order-creation.
//   start: 5/29 00:00 PT = 5/29 07:00 UTC
//   end:   6/05 23:59:59.999 PT = 6/06 06:59:59.999 UTC  (June is still PDT, UTC-7)
const BOGO_START_MS = Date.UTC(2026, 4, 29, PT_UTC_OFFSET_HOURS, 0, 0, 0)
const BOGO_END_MS = Date.UTC(2026, 5, 6, PT_UTC_OFFSET_HOURS - 1, 59, 59, 999)

// Eligible single-vial product IDs. Kits (glp3-10mg-kit / glp3-20mg-kit) are
// intentionally excluded.
export const GLP3_BOGO_IDS = ['glp3-10mg', 'glp3-20mg']
const GLP3_BOGO_ID_SET = new Set(GLP3_BOGO_IDS)

export function isGlp3BogoActive(now = new Date()) {
  const t = now.getTime()
  return t >= BOGO_START_MS && t <= BOGO_END_MS
}

// Compute the Buy-2-Get-1-Free discount. `items` = [{ id, price, quantity }].
// Callers MUST pass server-validated product prices (create.js) or the cart's
// own prices (checkout.js) — never client-supplied prices server-side. Returns
// { discount, freeVials }; zero when inactive so callers can call freely.
export function calcGlp3Bogo(items = [], now = new Date()) {
  if (!isGlp3BogoActive(now)) return { discount: 0, freeVials: 0 }
  let discount = 0
  let freeVials = 0
  for (const it of items) {
    if (!it || !GLP3_BOGO_ID_SET.has(it.id)) continue
    const qty = parseInt(it.quantity, 10) || 0
    const price = Number(it.price) || 0
    const free = Math.floor(qty / 3)
    if (free > 0) {
      discount += free * price
      freeVials += free
    }
  }
  return { discount: Math.round(discount * 100) / 100, freeVials }
}

export function bogoWindowLabel() {
  return 'MAY 29 — JUN 5'
}

// True when the B2G1 promo is active AND this product is one of the eligible
// GLP-3 singles — drives the sale badge on product cards + PDPs. Auto-false
// once the window closes, so callers can render unconditionally.
export function isBogoProduct(product, now = new Date()) {
  return isGlp3BogoActive(now) && !!product && GLP3_BOGO_ID_SET.has(product.id)
}
