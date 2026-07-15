// Shipping cost + method calculation. Single source of truth for the client
// (checkout + cart drawer) and the server (orders/create, admin manual/edit).
//
// Customer picks a SPEED TIER at checkout (2026-07-14). Every tier ships in the
// same insulated thermal mailer WITH an ice pack — cold chain is baseline, the
// tiers differ only by carrier speed. The chosen tier also drives the Shippo
// label service (see getServiceLadder + lib/shippo), so fulfillment doesn't
// pick a service by hand.
//
//   Ground     $9.95  · UPS Ground · FREE on orders $250+ (ground is the only
//                       free-eligible tier)
//   2-Day      $17.95 · UPS 2nd Day Air · the DEFAULT · never free
//   Overnight  $59.95 · UPS Next Day Air · never free
//
// Canada is a flat $50 international rate — no tier selector, immune to the
// free-ship threshold and sales (customs risk rides with the customer; see
// orders/create). Ships with an ice pack like everything else.

export const FREE_SHIPPING_THRESHOLD = 250
export const CANADA_SHIPPING_FLAT = 50
export const DEFAULT_SHIPPING_METHOD = 'twoday'

export const SHIPPING_TIERS = [
  { id: 'ground', label: 'Ground', price: 9.95, freeEligible: true, eta: '4–5 business days', service: 'ups_ground', fallback: 'usps_ground_advantage', blurb: 'Cheapest · insulated + ice pack' },
  { id: 'twoday', label: '2-Day', price: 17.95, freeEligible: false, eta: '2 business days', service: 'ups_second_day_air', fallback: 'usps_priority', blurb: 'Fast · insulated + ice pack' },
  { id: 'overnight', label: 'Overnight', price: 59.95, freeEligible: false, eta: 'Next business day', service: 'ups_next_day_air', fallback: 'usps_priority_express', blurb: 'Fastest · insulated + ice pack' },
]

// Resolve a method id to its tier, defaulting to 2-Day for unknown/absent ids
// (legacy orders created before tiers carry no method).
export function getShippingTier(methodId) {
  return SHIPPING_TIERS.find((t) => t.id === methodId)
    || SHIPPING_TIERS.find((t) => t.id === DEFAULT_SHIPPING_METHOD)
}

// Carrier service ladder for a tier, used by the Shippo label purchase:
// [preferred UPS service, USPS fallback]. Tier-driven so the label matches
// what the customer paid for.
export function getServiceLadder(methodId) {
  const t = getShippingTier(methodId)
  return [t.service, t.fallback]
}

export function calcShipping({ items, discountedSubtotal, saleActive = false, country = 'US', shippingMethod = DEFAULT_SHIPPING_METHOD }) {
  if (country === 'CA') {
    return {
      base: CANADA_SHIPPING_FLAT,
      total: CANADA_SHIPPING_FLAT,
      freeShipApplied: false,
      saleApplied: false,
      international: true,
      method: 'canada',
      methodLabel: 'International (Canada)',
    }
  }

  const tier = getShippingTier(shippingMethod)
  // Free shipping is GROUND ONLY (Matt): the $250 threshold — and any site-wide
  // free-ship sale — zero out the ground tier; 2-Day/Overnight always pay their
  // rate even over the threshold.
  const qualifiesFree = tier.freeEligible && (saleActive || Number(discountedSubtotal) >= FREE_SHIPPING_THRESHOLD)
  return {
    base: tier.price,
    total: qualifiesFree ? 0 : tier.price,
    freeShipApplied: qualifiesFree,
    saleApplied: saleActive && tier.freeEligible,
    international: false,
    method: tier.id,
    methodLabel: tier.label,
  }
}
