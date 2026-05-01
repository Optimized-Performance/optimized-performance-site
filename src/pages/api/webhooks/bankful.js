import { supabaseAdmin } from '../../../lib/supabase'
import { sendEmailAlert, sendSmsAlert, sendOrderConfirmation } from '../../../lib/alerts'
import { parseWebhookEvent } from '../../../lib/payments/cardProcessor'

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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const rawBody = await readRawBody(req)
    const event = await parseWebhookEvent({ rawBody, headers: req.headers })

    if (!event.verified) {
      console.error('[bankful-webhook] Verification failed:', event.reason)
      return res.status(401).json({ error: event.reason })
    }

    if (event.ignore) {
      return res.status(200).json({ received: true, action: 'ignored', reason: event.reason })
    }

    if (event.status !== 'completed') {
      return res.status(200).json({ received: true, action: 'noop', status: event.status })
    }

    const { eventId, txId, orderNumber } = event

    if (!eventId || !orderNumber) {
      console.error('[bankful-webhook] Missing eventId or orderNumber on parsed event')
      return res.status(200).json({ received: true, action: 'no_order_ref' })
    }

    const { error: replayError } = await supabaseAdmin
      .from('webhook_events')
      .insert({ provider: 'bankful', event_id: eventId, tx_id: txId || null })

    if (replayError && replayError.code === '23505') {
      console.warn('[bankful-webhook] Replay detected, ignoring:', eventId)
      return res.status(200).json({ received: true, action: 'replay_ignored' })
    }

    const { data: order, error: fetchError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('order_number', orderNumber)
      .eq('payment_status', 'pending')
      .single()

    if (fetchError || !order) {
      console.error('[bankful-webhook] Order not found for:', orderNumber)
      return res.status(200).json({ received: true, action: 'order_not_found' })
    }

    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        payment_status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id)

    if (updateError) {
      console.error('[bankful-webhook] Order update failed:', updateError)
      return res.status(500).json({ error: updateError.message })
    }

    const products = require('../../../data/products').default
    const lowStockItems = []
    for (const item of order.items) {
      const product = products.find((p) => p.sku === item.sku)
      const isKit = product?.isKit
      const parentProduct = isKit ? products.find((p) => p.id === product.parentId) : null
      const deductSku = isKit ? parentProduct?.sku : item.sku
      const deductQty = isKit ? product.vialCount * item.quantity : item.quantity
      if (!deductSku) continue

      const { data: invItem, error: invError } = await supabaseAdmin
        .from('inventory')
        .select('*')
        .eq('sku', deductSku)
        .single()
      if (invError || !invItem) continue

      const newStock = Math.max(0, invItem.stock - deductQty)
      await supabaseAdmin.from('inventory').update({ stock: newStock }).eq('sku', deductSku)

      if (newStock <= invItem.threshold) {
        lowStockItems.push({ ...invItem, stock: newStock, level: 'critical' })
      } else if (newStock <= invItem.reorder_threshold) {
        lowStockItems.push({ ...invItem, stock: newStock, level: 'reorder' })
      }
    }

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

    await sendOrderConfirmation(order)

    const criticalItems = lowStockItems.filter((i) => i.level === 'critical')
    const reorderItems = lowStockItems.filter((i) => i.level === 'reorder')
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
    console.error('[bankful-webhook] Error:', err)
    return res.status(500).json({ error: err.message })
  }
}
