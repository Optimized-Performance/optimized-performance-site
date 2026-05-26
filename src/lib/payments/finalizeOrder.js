import { supabaseAdmin } from '../supabase'
import { sendEmailAlert, sendSmsAlert, sendOrderConfirmation } from '../alerts'

// Shared post-payment finalization for any processor webhook. Looks up the
// pending order, marks it completed, decrements inventory (kit-aware), updates
// affiliate stats, sends the customer confirmation, and fires inventory alerts
// for any SKU that dropped into reorder/critical.
//
// Replay protection is the caller's responsibility — webhook handlers insert
// into webhook_events first and short-circuit on the 23505 unique violation
// before calling this.
export async function finalizePaidOrder({ orderNumber, sendConfirmation = true }) {
  // Accept both 'pending' (zelle/venmo manual rails + fraud-flagged) and
  // 'awaiting_payment' (instant rails before webhook capture) as valid
  // pre-finalize states. v17 split these for admin-view clarity, but every
  // path that ends in capture flows through here and must transition either.
  const { data: order, error: fetchError } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('order_number', orderNumber)
    .in('payment_status', ['pending', 'awaiting_payment'])
    .single()

  if (fetchError || !order) {
    return { ok: false, reason: 'order_not_found' }
  }

  const { error: updateError } = await supabaseAdmin
    .from('orders')
    .update({ payment_status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', order.id)

  if (updateError) {
    return { ok: false, reason: 'order_update_failed', error: updateError }
  }

  const products = require('../../data/products').default
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

  // Manual admin orders can suppress the confirmation email (e.g. comped
  // orders, or customers already being handled directly). Webhook callers
  // pass nothing → default true → unchanged behavior.
  if (sendConfirmation) {
    await sendOrderConfirmation(order)
  }

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

  return { ok: true, order }
}
