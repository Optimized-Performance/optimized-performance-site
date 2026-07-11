import { supabaseAdmin } from '../supabase'
import { sendEmailAlert, sendSmsAlert, sendOrderConfirmation, sendOrderCompletedOwnerAlert } from '../alerts'
import { calcCommission } from '../commission'
import { OPEN_PAYMENT_STATES, PAYMENT_STATUS, assertPaymentTransition } from '../order-status'
import { getCatalog } from '../catalog'
import { reportSaleToWarpath } from '../warpath-feed'

// Shared post-payment finalization for any processor webhook. Looks up the
// pending order, marks it completed, decrements inventory (kit-aware), updates
// affiliate stats, sends the customer confirmation, and fires inventory alerts
// for any SKU that dropped into reorder/critical.
//
// Replay protection is the caller's responsibility — webhook handlers insert
// into webhook_events first and short-circuit on the 23505 unique violation
// before calling this.
export async function finalizePaidOrder({ orderNumber, sendConfirmation = true, paidAmount = null, paidCurrency = null }) {
  // Accept both 'pending' (zelle/venmo manual rails + fraud-flagged) and
  // 'awaiting_payment' (instant rails before webhook capture) as valid
  // pre-finalize states. v17 split these for admin-view clarity, but every
  // path that ends in capture flows through here and must transition either.
  const { data: order, error: fetchError } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('order_number', orderNumber)
    .in('payment_status', OPEN_PAYMENT_STATES)
    .single()

  if (fetchError || !order) {
    return { ok: false, reason: 'order_not_found' }
  }

  // Defense-in-depth on the money path: reconcile the processor's actually-
  // captured amount against what we billed. Pricing is server-authoritative at
  // create time so this should never diverge today, but a future rail (or a
  // resumed/edited order) could — and silently fulfilling an underpaid order is
  // the failure we want to catch. DETECTION-ONLY (we still complete, to never
  // false-block a real payment over a units/currency quirk): a shortfall fires a
  // loud structured log + flags the result so an alert/clawback can follow.
  // USD only (PayPal reports USD); crypto is skipped (NOWPayments guarantees a
  // full 'finished' invoice). 1¢ epsilon for float noise.
  let amountMismatch = false
  if (
    paidAmount != null && Number.isFinite(Number(paidAmount)) && Number(paidAmount) > 0 &&
    (!paidCurrency || String(paidCurrency).toUpperCase() === 'USD') &&
    Number(paidAmount) + 0.01 < Number(order.total || 0)
  ) {
    amountMismatch = true
    console.error('[finalize] AMOUNT MISMATCH — captured < billed', JSON.stringify({
      orderNumber, paid: Number(paidAmount), billed: Number(order.total || 0), currency: paidCurrency || 'USD',
    }))
  }

  // Order is in an OPEN state (per the filter above) → completed is always legal
  // here; the assert catches future filter/logic drift loudly rather than
  // silently writing an illegal transition.
  assertPaymentTransition(order.payment_status, PAYMENT_STATUS.COMPLETED)
  // amount_paid (v31) = money collected. A first capture pays the full total, so
  // set it here — order editing / balance-due math reads amount_paid as the
  // source of truth for "what's been collected" (see orders/edit + refund).
  const completedUpdate = {
    payment_status: PAYMENT_STATUS.COMPLETED,
    amount_paid: Number(order.total || 0),
    updated_at: new Date().toISOString(),
  }

  // On a captured-amount shortfall, complete the order (so a real payment is
  // never false-blocked over a units/currency quirk) but FLAG it so it surfaces
  // in admin with a warning badge + reason before anyone ships it. flagged
  // (unlike blocked) doesn't gate fulfillment — it's a visible "review this"
  // signal on a path that should essentially never fire (pricing is
  // server-authoritative at create time). Never downgrade an existing 'blocked'.
  if (amountMismatch) {
    const existingReasons = Array.isArray(order.fraud_reasons) ? order.fraud_reasons : []
    const reason = `Underpaid: $${Number(paidAmount).toFixed(2)} captured vs $${Number(order.total || 0).toFixed(2)} billed`
    completedUpdate.fraud_reasons = existingReasons.includes(reason) ? existingReasons : [...existingReasons, reason]
    if (order.fraud_status !== 'blocked') completedUpdate.fraud_status = 'flagged'
  }

  const { error: updateError } = await supabaseAdmin
    .from('orders')
    .update(completedUpdate)
    .eq('id', order.id)

  if (updateError) {
    return { ok: false, reason: 'order_update_failed', error: updateError }
  }

  const products = await getCatalog()
  const lowStockItems = []
  for (const item of order.items) {
    const product = products.find((p) => p.sku === item.sku)
    const isKit = product?.isKit
    const parentProduct = isKit ? products.find((p) => p.id === product.parentId) : null
    const deductSku = isKit ? parentProduct?.sku : item.sku
    const deductQty = isKit ? product.vialCount * item.quantity : item.quantity
    if (!deductSku) continue

    // Atomic decrement (single locked DB statement) to prevent the oversell
    // race: two concurrent finalizes for the same SKU previously both read the
    // same stock and lost a decrement. Falls back to the old read-modify-write
    // if the decrement_inventory function isn't in the DB yet (see
    // supabase-migration-atomic-inventory-decrement.sql) so finalization never
    // breaks on a missing function; the fallback still carries the race until
    // the migration is run.
    let invItem = null
    try {
      const { data: rows, error: rpcErr } = await supabaseAdmin
        .rpc('decrement_inventory', { p_sku: deductSku, p_qty: deductQty })
      if (rpcErr) throw rpcErr
      const row = Array.isArray(rows) ? rows[0] : rows
      if (!row) continue // no inventory row for this SKU — nothing to deduct
      if (row.out_oversold) {
        console.error(`[finalizeOrder] OVERSOLD ${deductSku} on order ${order.order_number}: requested ${deductQty}, clamped to 0`)
      }
      invItem = {
        sku: deductSku,
        product: row.out_product,
        stock: row.out_new_stock,
        threshold: row.out_threshold,
        reorder_threshold: row.out_reorder,
      }
    } catch (rpcErr) {
      const { data: row, error: invError } = await supabaseAdmin
        .from('inventory')
        .select('*')
        .eq('sku', deductSku)
        .single()
      if (invError || !row) continue
      const fbStock = Math.max(0, row.stock - deductQty)
      await supabaseAdmin.from('inventory').update({ stock: fbStock }).eq('sku', deductSku)
      invItem = { ...row, stock: fbStock }
    }

    const newStock = invItem.stock
    if (newStock <= invItem.threshold) {
      lowStockItems.push({ ...invItem, stock: newStock, level: 'critical' })
    } else if (newStock <= invItem.reorder_threshold) {
      lowStockItems.push({ ...invItem, stock: newStock, level: 'reorder' })
    }
  }

  if (order.affiliate_code) {
    // Commission on product margin — shipping (logistics pass-through) and the
    // order's COGS snapshot are excluded (see lib/commission). total_revenue
    // below stays gross.
    const commission = calcCommission(order)
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

    // Mirror the attributed sale to the Warpath operator dashboard (who's selling
    // / what's selling). Fire-and-forget — never blocks or breaks finalization.
    await reportSaleToWarpath({ order, products, commission })
  }

  // Manual admin orders can suppress the confirmation email (e.g. comped
  // orders, or customers already being handled directly). Webhook callers
  // pass nothing → default true → unchanged behavior.
  if (sendConfirmation) {
    await sendOrderConfirmation(order)
  }

  // Internal owner alert on every completed sale (Matt + Tris). Fires regardless
  // of the customer-facing sendConfirmation flag (owners want comped/manual sales
  // too). Self-contained + never throws, so it can't break finalization.
  await sendOrderCompletedOwnerAlert(order)

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

  return { ok: true, order, amountMismatch }
}
