import { getCustomerIdFromReq } from '../../../lib/customer-session'
import { supabaseAdmin } from '../../../lib/supabase'
import { validateOrigin, rateLimit } from '../../../lib/security'

// Customer preference center — session-gated, operates only on the
// account's own email.
//
//   GET  → { marketingOptedOut, suppressionReason, restockAlerts: [{ product_sku, status, created_at }] }
//   POST → { marketingOptOut: boolean }   toggle the email_suppressions row
//        → { removeRestockSku: string }   drop a pending restock alert
//
// Opting back IN only deletes rows we created from a customer choice
// ('unsubscribe' | 'preference') — bounce/complaint suppressions stay, since
// re-mailing a bouncing address burns sender reputation regardless of intent.
export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).end()
  if (req.method === 'POST' && !validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 30, windowMs: 60000 })) {
    return res.status(429).json({ error: 'Too many requests.' })
  }

  const customerId = getCustomerIdFromReq(req)
  if (!customerId) return res.status(401).json({ error: 'Not authenticated' })
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  const { data: customer } = await supabaseAdmin
    .from('customers')
    .select('id, email')
    .eq('id', customerId)
    .maybeSingle()
  if (!customer) return res.status(401).json({ error: 'Not authenticated' })

  const email = String(customer.email).trim()

  if (req.method === 'GET') {
    const [{ data: suppression }, { data: alerts }] = await Promise.all([
      supabaseAdmin.from('email_suppressions').select('id, reason').ilike('email', email).maybeSingle(),
      supabaseAdmin
        .from('product_notify_requests')
        .select('product_sku, status, created_at')
        .ilike('email', email)
        .order('created_at', { ascending: false })
        .limit(25),
    ])
    return res.status(200).json({
      marketingOptedOut: !!suppression,
      suppressionReason: suppression?.reason || null,
      restockAlerts: alerts || [],
    })
  }

  // POST
  const { marketingOptOut, removeRestockSku } = req.body || {}

  if (typeof marketingOptOut === 'boolean') {
    if (marketingOptOut) {
      // Plain insert + swallow the dup — the unique index is on lower(email),
      // an expression index upsert can't target, so already-suppressed is the
      // 23505 path and a no-op by design.
      const { error } = await supabaseAdmin
        .from('email_suppressions')
        .insert({ email: email.toLowerCase(), reason: 'preference' })
      if (error && error.code !== '23505') {
        console.error('[customers/preferences] suppress failed:', error)
        return res.status(500).json({ error: 'Could not update preference.' })
      }
    } else {
      const { error } = await supabaseAdmin
        .from('email_suppressions')
        .delete()
        .ilike('email', email)
        .in('reason', ['unsubscribe', 'preference'])
      if (error) {
        console.error('[customers/preferences] unsuppress failed:', error)
        return res.status(500).json({ error: 'Could not update preference.' })
      }
    }
  }

  if (typeof removeRestockSku === 'string' && removeRestockSku.length <= 64) {
    const { error } = await supabaseAdmin
      .from('product_notify_requests')
      .delete()
      .ilike('email', email)
      .eq('product_sku', removeRestockSku)
    if (error) {
      console.error('[customers/preferences] alert remove failed:', error)
      return res.status(500).json({ error: 'Could not remove the alert.' })
    }
  }

  return res.status(200).json({ ok: true })
}
