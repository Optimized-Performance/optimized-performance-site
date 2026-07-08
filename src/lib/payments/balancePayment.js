import { supabaseAdmin } from '../supabase'
import { PAYMENT_STATUS, assertPaymentTransition } from '../order-status'

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// Apply a payment toward a balance_due order's outstanding balance — the charge
// created when an admin edited a completed order upward (add-on / upsell).
//
// Deliberately does NOT decrement inventory or credit affiliates: the edit
// endpoint (orders/edit) already applied the inventory delta and adjusted the
// affiliate credit for the added items at edit time (we ship on the call, not on
// payment). This helper ONLY moves money — bumps amount_paid and, once the total
// is covered, transitions balance_due -> completed. That's the key difference
// from finalizePaidOrder, which runs the full fulfillment side effects.
//
// paidAmount omitted (e.g. a card webhook that doesn't echo the amount) means
// "the full outstanding balance was paid" — safe because the balance session is
// created for exactly the balance owed.
export async function applyBalancePayment({ orderNumber, paidAmount = null }) {
  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('order_number', orderNumber)
    .eq('payment_status', PAYMENT_STATUS.BALANCE_DUE)
    .single()

  if (error || !order) return { ok: false, reason: 'order_not_balance_due' }

  const total = Number(order.total || 0)
  const alreadyPaid = Number(order.amount_paid || 0)
  const owed = round2(total - alreadyPaid)

  // Default to paying the full outstanding balance when no explicit amount is
  // given; otherwise honor the captured amount (capped so an overpayment can't
  // push amount_paid absurdly past total).
  const add = paidAmount != null && Number.isFinite(Number(paidAmount)) && Number(paidAmount) > 0
    ? Math.min(Number(paidAmount), owed)
    : owed

  const newPaid = round2(alreadyPaid + add)
  const covered = newPaid + 0.01 >= total

  const update = { amount_paid: newPaid, updated_at: new Date().toISOString() }
  if (covered) {
    // balance_due -> completed is legal per the v31 transition graph; assert so
    // any future filter/logic drift fails loud instead of writing silently.
    assertPaymentTransition(order.payment_status, PAYMENT_STATUS.COMPLETED)
    update.payment_status = PAYMENT_STATUS.COMPLETED
  }

  const { error: upErr } = await supabaseAdmin
    .from('orders')
    .update(update)
    .eq('id', order.id)

  if (upErr) return { ok: false, reason: 'update_failed', error: upErr }

  return { ok: true, covered, amountPaid: newPaid, balanceRemaining: round2(total - newPaid), order }
}
