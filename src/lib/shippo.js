import { packageSpecForOrder, splitStreetAndApt } from './fulfillment'

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

// Pick the rate to buy. Preference order:
//   1. the preferred USPS service for this package type (cheapest if multiple)
//   2. cheapest USPS rate
//   3. cheapest rate overall
// Rate payloads have carried the service token both nested (servicelevel.token)
// and flat (servicelevel_token) across API versions — read either.
function rateToken(r) {
  return r?.servicelevel?.token || r?.servicelevel_token || ''
}

export function pickRate(rates, preferredToken) {
  const usable = (rates || []).filter((r) => r && r.object_id && Number(r.amount) > 0)
  if (!usable.length) return null
  const byAmount = (a, b) => Number(a.amount) - Number(b.amount)
  const preferred = usable.filter((r) => rateToken(r) === preferredToken).sort(byAmount)
  if (preferred.length) return preferred[0]
  const usps = usable.filter((r) => String(r.provider).toUpperCase() === 'USPS').sort(byAmount)
  if (usps.length) return usps[0]
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
  const coldPack = spec.lbs === 5 // kit spec (see packageSpecForOrder)
  const preferredToken = coldPack ? 'usps_priority' : 'usps_ground_advantage'

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

    const rate = pickRate(shipment.rates, preferredToken)
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
