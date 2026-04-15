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
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Database not configured' })
    }

    const { name, email, address, city, state, zip, items, affiliateCode } = req.body

    if (!validateString(name) || !validateEmail(email) || !validateString(address) ||
        !validateString(city) || !validateString(state, { minLength: 1, maxLength: 50 }) || !validateZip(zip) ||
        !Array.isArray(items) || !items.length || items.length > 50) {
      return res.status(400).json({ error: 'Invalid or missing required fields' })
    }

    // SERVER-SIDE CALCULATION: recalculate totals from cart items to prevent tampering
    const products = require('../../../data/products').default
    let subtotal = 0
    for (const item of items) {
      const product = products.find(p => p.sku === item.sku || p.id === item.id)
      if (!product) {
        return res.status(400).json({ error: `Unknown product: ${item.sku || item.id}` })
      }
      const qty = parseInt(item.quantity) || 0
      if (qty < 1 || qty > 100) {
        return res.status(400).json({ error: 'Invalid item quantity' })
      }
      subtotal += product.price * qty
    }

    // Validate affiliate code server-side (cannot trust client-supplied discount/commission)
    let discount = 0
    let validatedAffiliateCode = null
    let validatedCommissionPct = 0
    if (affiliateCode && typeof affiliateCode === 'string') {
      const { data: aff } = await supabaseAdmin
        .from('affiliates')
        .select('code, discount_pct, commission_pct, active')
        .eq('code', affiliateCode.toUpperCase().trim())
        .eq('active', true)
        .maybeSingle()
      if (aff) {
        validatedAffiliateCode = aff.code
        validatedCommissionPct = Number(aff.commission_pct)
        discount = subtotal * (Number(aff.discount_pct) / 100)
      }
    }

    const discountedTotal = subtotal - discount
    // Add 4% MoonPay processing fee (matches client display)
    const total = Math.ceil(discountedTotal * 1.04 * 100) / 100

    if (total <= 0 || total > 50000) {
      return res.status(400).json({ error: 'Invalid order total' })
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

    if (validatedAffiliateCode) {
      insertData.affiliate_code = validatedAffiliateCode
      insertData.discount = discount
      insertData.affiliate_commission_pct = validatedCommissionPct
    }

    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .insert(insertData)
      .select()
      .single()

    if (error) {
      console.error('Order creation failed:', error)
      return res.status(500).json({ error: error.message })
    }

    return res.status(200).json({
      order_number: orderNumber,
      order_id: order.id,
      total,
      discount,
    })
  } catch (err) {
    console.error('Order creation failed:', err)
    return res.status(500).json({ error: err.message })
  }
}
