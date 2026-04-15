import { supabaseAdmin } from '../../../lib/supabase'
import { validateSessionToken } from '../../../lib/session'
import { validateOrigin, rateLimit, validateString } from '../../../lib/security'

function requireAuth(req) {
  const token = req.headers['x-admin-token']
  return validateSessionToken(token)
}

export default async function handler(req, res) {
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 60, windowMs: 60000 })) {
    return res.status(429).json({ error: 'Too many requests' })
  }
  if (!requireAuth(req)) return res.status(401).json({ error: 'Unauthorized' })
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('supply_lots')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return res.status(200).json(data || [])
    }

    if (req.method === 'POST') {
      const { productId, lotNumber, supplierLot, dateReceived, qtyVials, qtyRemaining, coaOnFile, notes } = req.body
      if (!validateString(productId) || !validateString(lotNumber)) {
        return res.status(400).json({ error: 'Invalid product or lot number' })
      }
      const qty = parseInt(qtyVials) || 0
      const remaining = parseInt(qtyRemaining) || qty

      const { data, error } = await supabaseAdmin
        .from('supply_lots')
        .insert({
          product_id: productId,
          lot_number: lotNumber,
          supplier_lot: supplierLot || '',
          date_received: dateReceived || new Date().toISOString().split('T')[0],
          qty_vials: qty,
          qty_remaining: remaining,
          coa_on_file: !!coaOnFile,
          notes: notes || '',
        })
        .select()
        .single()
      if (error) throw error
      return res.status(200).json(data)
    }

    if (req.method === 'PATCH') {
      const { id, ...updates } = req.body
      if (!id) return res.status(400).json({ error: 'Missing id' })

      const patch = {}
      if (updates.productId !== undefined) patch.product_id = updates.productId
      if (updates.lotNumber !== undefined) patch.lot_number = updates.lotNumber
      if (updates.supplierLot !== undefined) patch.supplier_lot = updates.supplierLot
      if (updates.dateReceived !== undefined) patch.date_received = updates.dateReceived
      if (updates.qtyVials !== undefined) patch.qty_vials = parseInt(updates.qtyVials) || 0
      if (updates.qtyRemaining !== undefined) patch.qty_remaining = parseInt(updates.qtyRemaining) || 0
      if (updates.coaOnFile !== undefined) patch.coa_on_file = !!updates.coaOnFile
      if (updates.notes !== undefined) patch.notes = updates.notes
      patch.updated_at = new Date().toISOString()

      const { data, error } = await supabaseAdmin
        .from('supply_lots')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return res.status(200).json(data)
    }

    if (req.method === 'DELETE') {
      const { id } = req.body
      if (!id) return res.status(400).json({ error: 'Missing id' })
      const { error } = await supabaseAdmin.from('supply_lots').delete().eq('id', id)
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    return res.status(405).end()
  } catch (err) {
    console.error('Admin lots error:', err)
    return res.status(500).json({ error: err.message })
  }
}
