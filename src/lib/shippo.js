import { packageSpecForOrder, splitStreetAndApt } from './fulfillment'
import { getServiceLadder } from './shipping'

// Shippo label purchase (replaces the ShipCheer CSV hop): create a shipment,
// pick the right USPS rate, buy the label, return tracking + label PDF URL.
//
// Env contract (set in Vercel):
//   SHIPPO_API_KEY     — live token (shippo_live_…) or test token (shippo_test_…;
//                        test tokens buy fake labels — use one to trial the flow)
//   SHIP_FROM_STREET / SHIP_FROM_CITY / SHIP_FROM_STATE / SHIP_FROM_ZIP — origin
//   SHIP_FROM_NAME / SHIP_FROM_PHONE / SHIP_FROM_EMAIL — optional (name defaults
//   to "Syngyn", email to support@)
//
// Service selection: cold-pack (kit) orders ship USPS Priority, vial-only ships
// USPS Ground Advantage — mirrors the lib/shipping pricing rationale. Falls
// back to the cheapest USPS rate, then the cheapest rate of any carrier.
//
// International (Canada): NOT bought via API yet — customs declarations
// (contents description, declared values) are a compliance decision, not a
// default we guess at. buyLabelForOrder returns international_manual and the
// admin buys that label in the Shippo dashboard.

const SHIPPO_BASE = 'https://api.goshippo.com'

function apiKey() {
  return process.env.SHIPPO_API_KEY || ''
}

function shipFromAddress() {
  const street1 = process.env.SHIP_FROM_STREET || ''
  const city = process.env.SHIP_FROM_CITY || ''
  const state = process.env.SHIP_FROM_STATE || ''
  const zip = process.env.SHIP_FROM_ZIP || ''
  if (!street1 || !city || !state || !zip) return null
  return {
    name: process.env.SHIP_FROM_NAME || 'Syngyn',
    street1,
    city,
    state,
    zip,
    country: 'US',
    phone: process.env.SHIP_FROM_PHONE || '',
    email: process.env.SHIP_FROM_EMAIL || 'support@syngyn.co',
  }
}

async function shippoPost(path, body) {
  const res = await fetch(`${SHIPPO_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `ShippoToken ${apiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = null }
  if (!res.ok || !data) {
    throw new Error(`[shippo] ${path} failed (${res.status}): ${text.slice(0, 400)}`)
  }
  return data
}

async function shippoGet(path) {
  const res = await fetch(`${SHIPPO_BASE}${path}`, {
    headers: { Authorization: `ShippoToken ${apiKey()}` },
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data) throw new Error(`[shippo] GET ${path} failed (${res.status})`)
  return data
}

// Preferred services, in the ORDER we actually ship (Matt): UPS 2nd Day Air
// first; when a lane doesn't return it, USPS Priority Mail (3-day). Override
// without a deploy via SHIP_PREFERRED_SERVICES (comma-separated Shippo
// servicelevel tokens, highest priority first). Each service needs its
// carrier account connected in the Shippo dashboard to appear in the rates.
export function preferredServiceTokens() {
  const raw = process.env.SHIP_PREFERRED_SERVICES
  if (raw && raw.trim()) return raw.split(',').map((t) => t.trim()).filter(Boolean)
  return ['ups_second_day_air', 'usps_priority']
}

// Rate payloads have carried the service token both nested (servicelevel.token)
// and flat (servicelevel_token) across API versions — read either.
function rateToken(r) {
  return r?.servicelevel?.token || r?.servicelevel_token || ''
}

// Pick the rate to buy: walk the preferred-service ladder in order and take
// the first one the carrier returned (cheapest if duplicated). Only if NONE
// of the preferred services came back does it drop to cheapest-overall — a
// true last resort, and the chosen service name is surfaced in the buy result
// + admin toast, so any fallback is visible rather than silent.
export function pickRate(rates, preferredTokens) {
  const usable = (rates || []).filter((r) => r && r.object_id && Number(r.amount) > 0)
  if (!usable.length) return null
  const byAmount = (a, b) => Number(a.amount) - Number(b.amount)
  const ladder = Array.isArray(preferredTokens) ? preferredTokens : [preferredTokens]
  for (const token of ladder) {
    const match = usable.filter((r) => rateToken(r) === token).sort(byAmount)
    if (match.length) return match[0]
  }
  return usable.sort(byAmount)[0]
}

// Buy a label for an order row. Returns { ok, ... } — never throws.
export async function buyLabelForOrder(order) {
  if (!apiKey()) return { ok: false, reason: 'not_configured', error: 'SHIPPO_API_KEY is not set.' }
  const from = shipFromAddress()
  if (!from) return { ok: false, reason: 'no_from_address', error: 'SHIP_FROM_STREET/CITY/STATE/ZIP are not set.' }
  if ((order.country || 'US') !== 'US') {
    return {
      ok: false,
      reason: 'international_manual',
      error: 'International labels need a customs declaration — buy this one in the Shippo dashboard.',
    }
  }

  const { street, apt } = splitStreetAndApt(order.shipping_address)
  const spec = packageSpecForOrder(order.items || [])
  // The customer's chosen speed tier drives the label service (v36):
  // ground→UPS Ground, twoday→2nd Day Air, overnight→Next Day Air, each with a
  // USPS fallback. Orders predating tiers (no shipping_method) fall back to the
  // env/default ladder so old orders still buy a sane label.
  const preferredTokens = order.shipping_method
    ? getServiceLadder(order.shipping_method)
    : preferredServiceTokens()

  try {
    const shipment = await shippoPost('/shipments/', {
      address_from: from,
      address_to: {
        name: order.customer_name || '',
        street1: street,
        street2: apt,
        city: order.city || '',
        state: order.state || '',
        zip: order.zip || '',
        country: 'US',
        email: order.customer_email || '',
      },
      parcels: [
        {
          length: String(spec.length),
          width: String(spec.width),
          height: String(spec.height),
          distance_unit: 'in',
          weight: String(spec.lbs * 16 + spec.oz),
          mass_unit: 'oz',
        },
      ],
      async: false,
    })

    const rate = pickRate(shipment.rates, preferredTokens)
    if (!rate) {
      const msgs = (shipment.messages || []).map((m) => m.text || m.code).filter(Boolean).join('; ')
      return { ok: false, reason: 'no_rates', error: msgs || 'Shippo returned no rates (check the destination address).' }
    }

    let tx = await shippoPost('/transactions/', {
      rate: rate.object_id,
      label_file_type: 'PDF_4x6',
      async: false,
    })

    // async:false usually returns final status; poll briefly if still queued.
    for (let i = 0; i < 5 && tx.status && !['SUCCESS', 'ERROR'].includes(tx.status); i++) {
      await new Promise((r) => setTimeout(r, 1500))
      tx = await shippoGet(`/transactions/${tx.object_id}`)
    }

    if (tx.status !== 'SUCCESS') {
      const msgs = (tx.messages || []).map((m) => m.text || m.code).filter(Boolean).join('; ')
      return { ok: false, reason: 'purchase_failed', error: msgs || `Label purchase ${tx.status || 'failed'}.` }
    }

    return {
      ok: true,
      trackingNumber: tx.tracking_number || '',
      trackingUrl: tx.tracking_url_provider || '',
      labelUrl: tx.label_url || '',
      cost: Number(rate.amount) || null,
      service: `${rate.provider} ${rate.servicelevel?.name || rate.servicelevel_name || rateToken(rate)}`.trim(),
    }
  } catch (err) {
    return { ok: false, reason: 'api_error', error: err.message }
  }
}
