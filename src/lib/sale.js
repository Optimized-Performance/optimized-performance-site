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
