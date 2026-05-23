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

// Window: Saturday May 23 2026 00:00 local through Monday May 25 2026 23:59 local
const SALE_START_YEAR = 2026
const SALE_START_MONTH_INDEX = 4 // May (0-indexed)
const SALE_START_DAY = 23
const SALE_END_YEAR = 2026
const SALE_END_MONTH_INDEX = 4
const SALE_END_DAY = 25

export const MEMORIAL_DAY_DISCOUNT_PCT = 15

// Internal: build local Date objects for the sale start (inclusive) and end
// (inclusive, end-of-day). Local time so a visitor seeing the banner sees a
// window that lines up with their calendar — no TZ off-by-one confusion.
function saleStart() {
  return new Date(SALE_START_YEAR, SALE_START_MONTH_INDEX, SALE_START_DAY, 0, 0, 0, 0)
}
function saleEnd() {
  // End of day 5/25 — 23:59:59.999 local
  return new Date(SALE_END_YEAR, SALE_END_MONTH_INDEX, SALE_END_DAY, 23, 59, 59, 999)
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
