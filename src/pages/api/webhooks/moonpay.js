import crypto from 'crypto'
import { supabaseAdmin } from '../../../lib/supabase'
import { sendEmailAlert, sendSmsAlert, sendOrderConfirmation } from '../../../lib/alerts'

// Disable Next.js body parsing so we can read the raw body for signature verification
export const config = {
  api: { bodyParser: false },
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => { data += chunk })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function verifySignature(rawBody, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(rawBody)
  const digest = hmac.digest('hex')
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature))
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const rawBody = await readRawBody(req)
    const signature = req.headers['moonpay-signature-v2'] || req.headers['moonpay-signature']

    // Verify webhook signature — MANDATORY
    const secret = process.env.MOONPAY_WEBHOOK_SECRET
    if (!secret) {
      console.error('MOONPAY_WEBHOOK_SECRET is not configured')
      return res.status(500).json({ error: 'Server configuration error' })
    }
    if (!signature) {
      console.error('MoonPay webhook missing signature header')
      return res.status(401).json({ error: 'Missing signature' })
    }
    const isValid = verifySignature(rawBody, signature, secret)
    if (!isValid) {
      console.error('MoonPay webhook signature verification failed')
      return res.status(401).json({ error: 'Invalid signature' })
    }

    const event = JSON.parse(rawBody)
    const { type, data } = event
    const eventId = event.id || `${type}-${data?.id}-${data?.externalTransactionId}`

    // Only process completed transactions
    if (type !== 'transaction_completed' && data?.status !== 'completed') {
      return res.status(200).json({ received: true, action: 'ignored' })
    }

    const txId = String(data?.id || data?.externalTransactionId || '')
    const orderNumber = data?.externalTransactionId

    if (!orderNumber || !txId) {
      console.error('MoonPay webhook missing externalTransactionId or tx id')
      return res.status(200).json({ received: true, action: 'no_order_ref' })
    }

    // REPLAY PROTECTION: record the webhook event; duplicate inserts will fail
    const { error: replayError } = await supabaseAdmin
      .from('webhook_events')
      .insert({ provider: 'moonpay', event_id: eventId, tx_id: txId })

    if (replayError && replayError.code === '23505') {
      console.warn('MoonPay webhook replay detected, ignoring:', eventId)
      return res.status(200).json({ received: true, action: 'replay_ignored' })
    }

    // Find the pending order
    const { data: order, error: fetchError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('order_number', orderNumber)
      .eq('payment_status', 'pending')
      .single()

    if (fetchError || !order) {
      console.error('Order not found for:', orderNumber)
      return res.status(200).json({ received: true, action: 'order_not_found' })
    }

    // Update order status to completed (UNIQUE constraint on moonpay_tx_id also prevents replays)
    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        payment_status: 'completed',
        moonpay_tx_id: txId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id)

    if (updateError && updateError.code === '23505') {
      console.warn('MoonPay tx_id already recorded, ignoring:', txId)
      return res.status(200).json({ received: true, action: 'tx_replay_ignored' })
    }

    // Decrement inventory for each item (kits deduct from parent SKU)
    const products = require('../../../data/products').default
    const lowStockItems = []
    for (const item of order.items) {
      const product = products.find(p => p.sku === item.sku)
      const isKit = product?.isKit
      const parentProduct = isKit ? products.find(p => p.id === product.parentId) : null
      const deductSku = isKit ? parentProduct?.sku : item.sku
      const deductQty = isKit ? (product.vialCount * item.quantity) : item.quantity

      if (!deductSku) continue

      const { data: invItem, error: invError } = await supabaseAdmin
        .from('inventory')
        .select('*')
        .eq('sku', deductSku)
        .single()

      if (invError || !invItem) continue

      const newStock = Math.max(0, invItem.stock - deductQty)

      await supabaseAdmin
        .from('inventory')
        .update({ stock: newStock })
        .eq('sku', deductSku)

      if (newStock <= invItem.threshold) {
        lowStockItems.push({ ...invItem, stock: newStock, level: 'critical' })
      } else if (newStock <= invItem.reorder_threshold) {
        lowStockItems.push({ ...invItem, stock: newStock, level: 'reorder' })
      }
    }

    // Update affiliate stats if an affiliate code was used
    if (order.affiliate_code) {
      const commission = Number(order.total || 0) * Number(order.affiliate_commission_pct || 0) / 100
      const { data: aff } = await supabaseAdmin
        .from('affiliates')
        .select('id, total_sales, total_revenue, total_commission')
        .eq('code', order.affiliate_code)
        .single()
      if (aff) {
        await supabaseAdmin
          .from('affiliates')
          .update({
            total_sales: (aff.total_sales || 0) + 1,
            total_revenue: Number(aff.total_revenue || 0) + Number(order.total || 0),
            total_commission: Number(aff.total_commission || 0) + commission,
            updated_at: new Date().toISOString(),
          })
          .eq('id', aff.id)
      }
    }

    // Send order confirmation email to customer
    await sendOrderConfirmation(order)

    // Send low stock alerts if needed
    const criticalItems = lowStockItems.filter(i => i.level === 'critical')
    const reorderItems = lowStockItems.filter(i => i.level === 'reorder')

    if (criticalItems.length > 0) {
      await Promise.all([
        sendEmailAlert(criticalItems, 'critical'),
        sendSmsAlert(criticalItems, 'critical'),
      ])
    }
    if (reorderItems.length > 0) {
      await Promise.all([
        sendEmailAlert(reorderItems, 'reorder'),
        sendSmsAlert(reorderItems, 'reorder'),
      ])
    }

    return res.status(200).json({
      received: true,
      action: 'order_completed',
      order_number: orderNumber,
    })
  } catch (err) {
    console.error('MoonPay webhook error:', err)
    return res.status(500).json({ error: err.message })
  }
}
