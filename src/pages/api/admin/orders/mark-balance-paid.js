// Manually settle a balance_due order's outstanding balance after the admin has
// confirmed an off-platform payment (Zelle/Venmo/cash) for the added item(s).
// Mirrors mark-venmo-paid / mark-zelle-paid, but routes through applyBalancePayment
// (money-only) rather than finalizePaidOrder — the edit already handled inventory
// + affiliate credit for the added items. Card balances settle automatically via
// the NoRamp webhook; this button is the manual-rail equivalent.
//
// Auth: admin session token in x-admin-token (same as other admin endpoints).

import { supabaseAdmin } from '../../../../lib/supabase'
import { validateSessionToken } from '../../../../lib/session'
import { validateOrigin, rateLimit } from '../../../../lib/security'
import { applyBalancePayment } from '../../../../lib/payments/balancePayment'
import { PAYMENT_STATUS } from '../../../../lib/order-status'

function requireAuth(req) {
  return validateSessionToken(req.headers['x-admin-token'])
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 30, windowMs: 60000 })) return res.status(429).json({ error: 'Too many requests' })
  if (!requireAuth(req)) return res.status(401).json({ error: 'Unauthorized' })
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  try {
    const { id, order_number, amount } = req.body || {}
    if (!id && !order_number) return res.status(400).json({ error: 'Missing order id or order_number' })

    let q = supabaseAdmin.from('orders').select('order_number, payment_status')
    q = id ? q.eq('id', id) : q.eq('order_number', String(order_number).trim().toUpperCase())
    const { data: order, error: fetchErr } = await q.maybeSingle()
    if (fetchErr || !order) return res.status(404).json({ error: 'Order not found' })

    if (order.payment_status !== PAYMENT_STATUS.BALANCE_DUE) {
      return res.status(409).json({ error: `Order payment_status is "${order.payment_status}", not "balance_due". Nothing to settle.` })
    }

    // amount optional — omitted settles the full outstanding balance.
    const paidAmount = amount != null && Number.isFinite(Number(amount)) && Number(amount) > 0 ? Number(amount) : null
    const result = await applyBalancePayment({ orderNumber: order.order_number, paidAmount })
    if (!result.ok) {
      console.error('[orders/mark-balance-paid] failed:', result.reason, result.error)
      return res.status(500).json({ error: result.error?.message || result.reason })
    }

    return res.status(200).json({
      ok: true,
      order_number: order.order_number,
      covered: result.covered,
      amount_paid: result.amountPaid,
      balance_remaining: result.balanceRemaining,
      message: result.covered
        ? 'Balance settled — order back to completed.'
        : `Partial balance recorded. $${result.balanceRemaining.toFixed(2)} still outstanding.`,
    })
  } catch (err) {
    console.error('[orders/mark-balance-paid] error:', err)
    return res.status(500).json({ error: err.message })
  }
}
