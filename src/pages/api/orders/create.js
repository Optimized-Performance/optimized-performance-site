import { supabaseAdmin } from '../../../lib/supabase'
import { validateOrigin, rateLimit, validateEmail, validateString, validateZip } from '../../../lib/security'

function generateOrderNumber() {
  const date = new Date()
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `OP-${y}${m}${d}-${rand}`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 10, windowMs: 60000 })) return res.status(429).json({ error: 'Too many requests' })

  try {
    const { name, email, address, city, state, zip, items, subtotal, total, discount, affiliateCode, affiliateCommissionPct } = req.body

    if (!validateString(name) || !validateEmail(email) || !validateString(address) ||
        !validateString(city) || !validateString(state, { minLength: 1, maxLength: 50 }) || !validateZip(zip) ||
        !Array.isArray(items) || !items.length || items.length > 50) {
      return res.status(400).json({ error: 'Invalid or missing required fields' })
    }

    if (typeof subtotal !== 'number' || typeof total !== 'number' || total <= 0 || total > 50000) {
      return res.status(400).json({ error: 'Invalid order totals' })
    }

    const orderNumber = generateOrderNumber()

    const insertData = {
      order_number: orderNumber,
      customer_name: name,
      customer_email: email,
      shipping_address: address,
      city,
      state,
      zip,
      items,
      subtotal,
      total,
      payment_status: 'pending',
    }

    // Include affiliate data if present
    if (affiliateCode) {
      insertData.affiliate_code = affiliateCode
      insertData.discount = discount || 0
      insertData.affiliate_commission_pct = affiliateCommissionPct || 0
    }

    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .insert(insertData)
      .select()
      .single()

    if (error) throw error

    return res.status(200).json({
      order_number: orderNumber,
      order_id: order.id,
    })
  } catch (err) {
    console.error('Order creation failed:', err)
    return res.status(500).json({ error: err.message })
  }
}
