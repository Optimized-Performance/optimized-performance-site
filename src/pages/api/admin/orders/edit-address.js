import { supabaseAdmin } from '../../../../lib/supabase'
import { validateSessionToken } from '../../../../lib/session'
import { validateOrigin, rateLimit, validateString, validateZip } from '../../../../lib/security'
import { isUsState, isCaProvince, isCaPostal } from '../../../../lib/us-states'

// Admin shipping-address edit — the "customer emailed a new address" fix that
// used to live on paper notes. Updates the order's recipient name + address
// columns and stamps edit_history, so the Shippo label (which reads the order
// row at purchase time) and the packing desk both see the corrected address.
//
// Deliberately NOT allowed: changing the destination COUNTRY. US vs CA drives
// the shipping charge ($50 flat), the customs-ack waiver, and rail gating —
// a country change is a cancel-and-recreate, not an address edit.

function requireAuth(req) {
  return validateSessionToken(req.headers['x-admin-token'])
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 30, windowMs: 60000 })) return res.status(429).json({ error: 'Too many requests' })
  if (!requireAuth(req)) return res.status(401).json({ error: 'Unauthorized' })
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  try {
    const { id, order_number } = req.body || {}
    let { name, address, city, state, zip } = req.body || {}
    if (!id && !order_number) return res.status(400).json({ error: 'Missing order id or order_number' })

    if (typeof name === 'string') name = name.trim()
    if (typeof address === 'string') address = address.trim()
    if (typeof city === 'string') city = city.trim()
    if (typeof state === 'string') state = state.trim()
    if (typeof zip === 'string') zip = zip.trim()

    if (!validateString(name)) return res.status(400).json({ error: 'Invalid or missing recipient name' })
    if (!validateString(address)) return res.status(400).json({ error: 'Invalid or missing street address' })
    if (!validateString(city)) return res.status(400).json({ error: 'Invalid or missing city' })
    if (!validateString(state, { minLength: 1, maxLength: 50 })) return res.status(400).json({ error: 'Invalid or missing state' })
    if (!validateZip(zip)) return res.status(400).json({ error: 'Invalid or missing ZIP / postal code' })

    let q = supabaseAdmin.from('orders').select('id, order_number, country, customer_name, shipping_address, city, state, zip, edit_history')
    q = id ? q.eq('id', id) : q.eq('order_number', String(order_number).trim().toUpperCase())
    const { data: order, error: fetchErr } = await q.maybeSingle()
    if (fetchErr || !order) return res.status(404).json({ error: 'Order not found' })

    // Same destination rules the checkout enforced (mirrors api/orders/create).
    const country = order.country === 'CA' ? 'CA' : 'US'
    if (country === 'CA') {
      if (!isCaProvince(state)) return res.status(400).json({ error: 'This is a Canadian order — enter a valid CA province/territory.' })
      if (!isCaPostal(zip)) return res.status(400).json({ error: 'This is a Canadian order — enter a valid postal code (A1A 1A1).' })
    } else if (!isUsState(state)) {
      return res.status(400).json({ error: 'Enter a valid US state code. (Country changes need a cancel + re-create, not an address edit.)' })
    }

    const historyEntry = {
      at: new Date().toISOString(),
      address_before: {
        name: order.customer_name, address: order.shipping_address,
        city: order.city, state: order.state, zip: order.zip,
      },
      address_after: { name, address, city, state, zip },
    }

    const { error: upErr } = await supabaseAdmin
      .from('orders')
      .update({
        customer_name: name,
        shipping_address: address,
        city,
        state,
        zip,
        edit_history: [...(Array.isArray(order.edit_history) ? order.edit_history : []), historyEntry],
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id)
    if (upErr) {
      console.error('[orders/edit-address] update failed:', upErr)
      return res.status(500).json({ error: upErr.message })
    }

    return res.status(200).json({ ok: true, order_number: order.order_number, message: 'Shipping address updated.' })
  } catch (err) {
    console.error('[orders/edit-address] error:', err)
    return res.status(500).json({ error: err.message })
  }
}
