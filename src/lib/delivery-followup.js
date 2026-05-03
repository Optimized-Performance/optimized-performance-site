import { supabaseAdmin } from './supabase'
import { sendDeliveryFollowup } from './alerts'

const FOLLOWUP_AFTER_DAYS = 7

// Sends the 7-day "checking in" email for any shipped order that hasn't yet
// had a follow-up sent. Idempotent — orders with delivery_followup_sent_at != null
// are filtered out at the query level. Returns a structured run log.
//
// Used by:
//   - /api/inventory/check-stock (daily Vercel cron — keeps us within 2-cron limit)
//   - /api/cron/delivery-followup (manual / external trigger entry point)
export async function runDeliveryFollowups() {
  const log = {
    started_at: new Date().toISOString(),
    eligible_orders: 0,
    followups_sent: 0,
    errors: [],
  }

  if (!supabaseAdmin) {
    log.errors.push({ fatal: 'Database not configured' })
    log.finished_at = new Date().toISOString()
    return log
  }

  try {
    const cutoff = new Date(Date.now() - FOLLOWUP_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const { data: orders, error } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, customer_email, tracking, shipped_at')
      .eq('fulfillment_status', 'shipped')
      .is('delivery_followup_sent_at', null)
      .not('shipped_at', 'is', null)
      .lte('shipped_at', cutoff)
      .limit(200)
    if (error) throw error

    log.eligible_orders = (orders || []).length

    for (const order of orders || []) {
      try {
        await sendDeliveryFollowup(order)
        const { error: upErr } = await supabaseAdmin
          .from('orders')
          .update({ delivery_followup_sent_at: new Date().toISOString() })
          .eq('id', order.id)
        if (upErr) throw upErr
        log.followups_sent += 1
      } catch (perOrderErr) {
        log.errors.push({ order: order.order_number, error: perOrderErr.message })
      }
    }
  } catch (err) {
    console.error('[delivery-followup] fatal:', err)
    log.errors.push({ fatal: err.message })
  }

  log.finished_at = new Date().toISOString()
  return log
}
