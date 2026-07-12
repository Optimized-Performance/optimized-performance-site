import { cartRequiresColdPack } from './shipping'

// Shared fulfillment helpers — package specs + address parsing used by both
// the legacy CSV export and the Shippo label purchase (lib/shippo).

// Conservative per-package defaults derived from the cart contents. Cold-chain
// packaging pivoted 2026-05-11 from Uline insulated boxes + PCM gel to
// thermal-insulated mailers. The dimensions below are the historical Uline
// box specs — safe (over-)estimates so labels won't underpay. TODO once the
// thermal-mailer SKUs are confirmed: replace with real outer dims + weights
// so postage matches billed cost.
export function packageSpecForOrder(items) {
  if (cartRequiresColdPack(items)) {
    return { lbs: 5, oz: 0, length: 10, width: 8, height: 9 }
  }
  return { lbs: 1, oz: 8, length: 8, width: 6, height: 5 }
}

// Best-effort apartment/suite extraction from the single-line shipping
// address customers type at checkout. Carrier APIs want street1/street2. If
// we can't parse it, street2 stays blank and the whole string rides street1 —
// the carrier's address validator handles the rest.
export function splitStreetAndApt(addressLine) {
  if (!addressLine) return { street: '', apt: '' }
  const s = String(addressLine).trim()
  const aptPattern = /\b(apt|apartment|unit|suite|ste|#)\.?\s*[\w-]+/i
  const match = s.match(aptPattern)
  if (!match) return { street: s, apt: '' }
  const apt = match[0].trim()
  const street = s.replace(aptPattern, '').replace(/[,\s]+$/, '').trim()
  return { street, apt }
}
