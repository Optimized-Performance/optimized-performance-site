// Export pending shipments as a ShipCheer-compatible CSV.
//
// Spec lifted from ShipCheer's "Download Sample Spreadsheet" — 15 columns,
// header names verbatim. ShipCheer remembers the column mapping after the
// first import, so as long as we match these names exactly the upload is
// one-click going forward.
//
// Order eligibility:
//   payment_status = 'completed'        (customer paid)
//   tracking IS NULL                    (label not yet generated)
//   fulfillment_status NOT IN           (already in flight or already done)
//     ('shipped', 'fulfilled', 'cancelled')
//   fraud_status != 'blocked'           (velocity engine blocked — never ship)
//
// 'flagged' orders ARE included so admin can see them in ShipCheer alongside
// clean orders; the FLAGGED badge in the admin Orders tab is the actual
// review surface — admin reviews + clears in admin BEFORE running the export.

import { supabaseAdmin } from '../../../../lib/supabase'
import { validateSessionToken } from '../../../../lib/session'
import { validateOrigin, rateLimit } from '../../../../lib/security'
import { cartRequiresColdPack } from '../../../../lib/shipping'

function requireAuth(req) {
  const token = req.headers['x-admin-token']
  return validateSessionToken(token)
}

// Conservative per-package defaults derived from the cart contents. Vials
// ship in a Uline S-7887 insulated foam shipper (8x6x5 outer); kits ship in
// a Uline S-13391 (10x8x9 outer). Weights include vials + box + full-sheet
// PCM gel and run a few ounces over actual to give ShipCheer's quote engine
// the right billing weight.
function packageSpecForOrder(items) {
  if (cartRequiresColdPack(items)) {
    return { lbs: 5, oz: 0, length: 10, width: 8, height: 9 }
  }
  return { lbs: 1, oz: 8, length: 8, width: 6, height: 5 }
}

// Best-effort apartment/suite extraction from the single-line shipping
// address customers type at checkout. ShipCheer wants Street + Apt as
// separate columns. If we can't parse it, leave Apt blank and put the
// whole string in Street — ShipCheer's address validator handles the rest.
function splitStreetAndApt(addressLine) {
  if (!addressLine) return { street: '', apt: '' }
  const s = String(addressLine).trim()
  const aptPattern = /\b(apt|apartment|unit|suite|ste|#)\.?\s*[\w-]+/i
  const match = s.match(aptPattern)
  if (!match) return { street: s, apt: '' }
  const apt = match[0].trim()
  const street = s.replace(aptPattern, '').replace(/[,\s]+$/, '').trim()
  return { street, apt }
}

function csvCell(value) {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

const HEADERS = [
  'Receiver Name',
  'Company Name',
  'Phone',
  'Email',
  'Country',
  'Street',
  'City',
  'State/Province',
  'Zipcode',
  'Apt/Unit/Suite/etc.',
  'Weight(Pound)',
  'Weight(Ounces)',
  'Length(Inches)',
  'Width(Inches)',
  'Height(Inches)',
]

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 30, windowMs: 60000 })) {
    return res.status(429).json({ error: 'Too many requests' })
  }
  if (!requireAuth(req)) return res.status(401).json({ error: 'Unauthorized' })
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  try {
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('order_number, customer_name, customer_email, shipping_address, city, state, zip, items, fulfillment_status, fraud_status')
      .eq('payment_status', 'completed')
      .is('tracking', null)
      .neq('fraud_status', 'blocked')
      .order('created_at', { ascending: true })
      .limit(500)

    if (error) throw error

    const eligible = (data || []).filter((o) => {
      const status = o.fulfillment_status || 'pending'
      return !['shipped', 'fulfilled', 'cancelled'].includes(status)
    })

    const rows = eligible.map((o) => {
      const { street, apt } = splitStreetAndApt(o.shipping_address)
      const pkg = packageSpecForOrder(o.items || [])
      return [
        o.customer_name || '',
        '', // Company Name — not collected at checkout
        '', // Phone — not collected at checkout
        o.customer_email || '',
        'United States',
        street,
        o.city || '',
        o.state || '',
        o.zip || '',
        apt,
        pkg.lbs,
        pkg.oz,
        pkg.length,
        pkg.width,
        pkg.height,
      ]
    })

    const csvLines = [HEADERS, ...rows].map((row) => row.map(csvCell).join(','))
    const csv = csvLines.join('\r\n') + '\r\n'

    const today = new Date().toISOString().split('T')[0]
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="shipcheer-${today}.csv"`)
    res.setHeader('Cache-Control', 'no-store')
    // Carry the export's order_numbers in a header so the client can snapshot
    // them for the bulk-tracking-paste step downstream. CORS-exposed via
    // Access-Control-Expose-Headers since fetch hides non-safelisted headers
    // by default.
    const orderNumbers = eligible.map((o) => o.order_number).join(',')
    res.setHeader('X-OPP-ShipCheer-OrderNumbers', orderNumbers)
    res.setHeader('Access-Control-Expose-Headers', 'X-OPP-ShipCheer-OrderNumbers')
    return res.status(200).send(csv)
  } catch (err) {
    console.error('[orders/export-shipcheer]', err)
    return res.status(500).json({ error: err.message })
  }
}
