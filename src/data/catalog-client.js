// Client-safe catalog helpers — NONE of these reference the `products` array.
//
// They live in their own module (separate from data/products.js) so client
// components can import them WITHOUT dragging the full product catalog —
// including restricted SKUs (HGH/GLP/Rx) — into the client bundle. The catalog
// array does not tree-shake out of data/products.js (its array-referencing
// exports keep it alive in the shared chunk), so any client import from that
// module leaks the restricted SKUs to public pages. Importing from HERE doesn't.
//
// data/products.js re-exports everything below (`export * from './catalog-client'`)
// so server-side importers can keep importing these from data/products.

// Get effective stock for a product (kits derive from parent). Deliberately
// does NOT reference a product array — callers pass the inventory map.
export function getEffectiveStock(product, inventoryMap = {}) {
  if (product.isKit) {
    const parentStock = inventoryMap[product.parentId] ?? 0;
    return Math.floor(parentStock / product.vialCount);
  }
  return inventoryMap[product.id] ?? product.stock ?? 0;
}

// Restricted-SKU visibility kill switches + cohort gate resolution.
export function isRestrictedHidden() {
  return process.env.NEXT_PUBLIC_HIDE_RESTRICTED === 'true';
}

export function isRestrictedForceShown() {
  return process.env.NEXT_PUBLIC_RESTRICTED_FORCE_SHOW === 'true';
}

export function shouldShowRestricted(cohortAllowed) {
  if (isRestrictedHidden()) return false;
  if (isRestrictedForceShown()) return true;
  return cohortAllowed === true;
}

// Inquiry CTA for a hidden detail page.
export function getPrivateInquiryUrl() {
  return (
    process.env.NEXT_PUBLIC_PRIVATE_INQUIRY_URL ||
    'mailto:support@syngyn.co?subject=Research%20inquiry&body=I%27m%20interested%20in%20a%20research%20inquiry.'
  );
}

// Preorder behavior — opt-out by default.
export function isPreorderable(product) {
  return product?.preorder !== false;
}

// Format a preorder ship date for customer display, e.g. "Jun 15, 2026".
export function formatPreorderShipDate(product) {
  if (!product?.preorderShipDate) return null;
  try {
    const [y, m, d] = product.preorderShipDate.split('-').map(Number);
    if (!y || !m || !d) return null;
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return null;
  }
}
