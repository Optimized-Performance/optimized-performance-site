import { supabaseAdmin } from '../supabase'
import { reconcileCardSession } from './cardProcessor'
import { finalizePaidOrder } from './finalizeOrder'
import { PAYMENT_STATUS } from '../order-status'

// Reconcile one card order against the gateway. If the order is still awaiting
// payment but the gateway shows it paid (a dropped/late callback), finalize it.
// Idempotent + safe to call repeatedly (finalizePaidOrder filters open-state).
// Never throws — returns a small status object. Degrades safely if the
// card_session_id column doesn't exist yet (migration v30 not run): the webhook
// remains the primary finalizer.
export async function reconcileCardOrder(orderNumber) {
  if (!supabaseAdmin || !orderNumber) return { ok: false, reason: 'bad_input' }

  let order
  try {
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, payment_status, payment_method, card_session_id')
      .eq('order_number', orderNumber)
      .maybeSingle()
    if (error) {
      console.warn('[reconcile-card] lookup skipped:', error.message)
      return { ok: false, reason: 'lookup_failed' }
    }
    order = data
  } catch (err) {
    return { ok: false, reason: 'lookup_error', error: err.message }
  }

  if (!order) return { ok: false, reason: 'order_not_found' }
  if (order.payment_method !== 'card') return { ok: false, reason: 'not_card' }
  // Open states a card payment can legitimately sit in: awaiting_payment
  // (checkout capture) or pending (admin card invoice — created unpaid, no
  // expiry). Reconciling pending mirrors the webhook, which finalizes any
  // non-balance_due order on payment.succeeded regardless of state; without
  // it a paid invoice with a dropped callback would strand as pending.
  if (order.payment_status !== PAYMENT_STATUS.AWAITING_PAYMENT && order.payment_status !== PAYMENT_STATUS.PENDING) {
    return { ok: true, reason: 'not_open', status: order.payment_status }
  }
  if (!order.card_session_id) return { ok: false, reason: 'no_session_id' }

  const result = await reconcileCardSession({ sessionId: order.card_session_id, orderNumber })
  if (!result.paid) return { ok: true, reason: 'not_paid', status: result.status }

  const fin = await finalizePaidOrder({ orderNumber })
  return { ok: !!fin.ok, reason: fin.ok ? 'finalized' : fin.reason, finalized: !!fin.ok }
}
