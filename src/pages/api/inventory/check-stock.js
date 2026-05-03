import { supabaseAdmin } from '../../../lib/supabase'
import { sendEmailAlert, sendSmsAlert } from '../../../lib/alerts'
import { runDeliveryFollowups } from '../../../lib/delivery-followup'

// Daily Vercel cron — runs two pipelines:
//   1. Inventory check (original purpose) — alert on low stock
//   2. Delivery follow-ups — send 7-day check-in emails on shipped orders
// Combined into one Vercel cron entry to stay within the Hobby tier 2-cron limit.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const authHeader = req.headers.authorization
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  let inventoryResult = { critical: [], reorder: [] }
  let inventoryError = null

  try {
    const { data: allItems, error } = await supabaseAdmin
      .from('inventory')
      .select('product, size, sku, stock, threshold, reorder_threshold')
    if (error) throw error

    const criticalItems = allItems.filter(item => item.stock <= item.threshold)
    const reorderItems = allItems.filter(
      item => item.stock <= item.reorder_threshold && item.stock > item.threshold
    )

    const alerts = []
    if (criticalItems.length > 0) {
      alerts.push(
        sendEmailAlert(criticalItems, 'critical'),
        sendSmsAlert(criticalItems, 'critical'),
      )
    }
    if (reorderItems.length > 0) {
      alerts.push(
        sendEmailAlert(reorderItems, 'reorder'),
        sendSmsAlert(reorderItems, 'reorder'),
      )
    }
    if (alerts.length > 0) await Promise.all(alerts)

    inventoryResult = { critical: criticalItems, reorder: reorderItems }
  } catch (err) {
    console.error('Stock check failed:', err)
    inventoryError = err.message
  }

  // Always run the delivery-followup pipeline regardless of inventory outcome —
  // both run daily and a stock-check failure shouldn't block customer follow-ups.
  const followupLog = await runDeliveryFollowups()

  return res.status(inventoryError ? 500 : 200).json({
    inventory: {
      message: inventoryError
        ? `Inventory check failed: ${inventoryError}`
        : `Alerts sent — ${inventoryResult.critical.length} critical, ${inventoryResult.reorder.length} reorder`,
      critical: inventoryResult.critical,
      reorder: inventoryResult.reorder,
      error: inventoryError,
    },
    delivery_followups: followupLog,
    checked: new Date(),
  })
}
