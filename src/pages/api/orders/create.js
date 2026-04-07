export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const { createClient } = await import('@supabase/supabase-js')

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !key) {
      return res.status(500).json({
        error: 'Missing env vars',
        hasUrl: !!url,
        hasKey: !!key,
      })
    }

    const supabase = createClient(url, key)

    const { name, email, address, city, state, zip, items, subtotal, total, discount, affiliateCode, affiliateCommissionPct } = req.body

    if (!name || !email || !address || !city || !state || !zip || !items || !items.length) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    const date = new Date()
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase()
    const orderNumber = `OP-${y}${m}${d}-${rand}`

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

    if (affiliateCode) {
      insertData.affiliate_code = affiliateCode
      insertData.discount = discount || 0
      insertData.affiliate_commission_pct = affiliateCommissionPct || 0
    }

    const { data: order, error } = await supabase
      .from('orders')
      .insert(insertData)
      .select()
      .single()

    if (error) {
      return res.status(500).json({ error: error.message, code: error.code, details: error.details })
    }

    return res.status(200).json({
      order_number: orderNumber,
      order_id: order.id,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack?.split('\n').slice(0, 3) })
  }
}
