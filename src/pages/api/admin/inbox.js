import { supabaseAdmin } from '../../../lib/supabase'
import { validateSessionToken } from '../../../lib/session'
import { validateOrigin, rateLimit } from '../../../lib/security'
import { sendCustomerReply } from '../../../lib/alerts'

const ALLOWED_STATUSES = ['new', 'auto_replied', 'draft_pending', 'sent', 'archived', 'spam', 'escalated']

function requireAuth(req) {
  return validateSessionToken(req.headers['x-admin-token'])
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
      const { stats, status, classification, limit = '200', id } = req.query

      // Single email detail
      if (id) {
        const { data, error } = await supabaseAdmin
          .from('inbound_emails')
          .select('*')
          .eq('id', id)
          .single()
        if (error) throw error
        return res.status(200).json(data)
      }

      // Stats branch
      if (stats === '1') {
        const { data: counts, error } = await supabaseAdmin
          .from('inbound_emails')
          .select('status, classification')
          .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        if (error) throw error
        const byStatus = {}
        const byClassification = {}
        for (const row of counts || []) {
          byStatus[row.status] = (byStatus[row.status] || 0) + 1
          if (row.classification) byClassification[row.classification] = (byClassification[row.classification] || 0) + 1
        }
        return res.status(200).json({ byStatus, byClassification })
      }

      let q = supabaseAdmin
        .from('inbound_emails')
        .select('id, from_email, from_name, subject, classification, classification_reason, related_order_number, status, reply_subject, reply_sent_at, spam_score, created_at, processed_at')
        .order('created_at', { ascending: false })
        .limit(Math.min(Number(limit) || 200, 1000))
      if (status) q = q.eq('status', String(status))
      if (classification) q = q.eq('classification', String(classification))

      const { data, error } = await q
      if (error) throw error
      return res.status(200).json(data || [])
    }

    if (req.method === 'PATCH') {
      const { id, action, reply_subject, reply_body, status, classification } = req.body || {}
      if (!id) return res.status(400).json({ error: 'Missing id' })

      const { data: row, error: fetchErr } = await supabaseAdmin
        .from('inbound_emails')
        .select('*')
        .eq('id', id)
        .single()
      if (fetchErr || !row) return res.status(404).json({ error: 'Email not found' })

      // action: 'send' — admin-approved draft, send via SendGrid + mark sent
      if (action === 'send') {
        const subject = reply_subject || row.reply_subject || `Re: ${row.subject}`
        const body = reply_body || row.reply_body
        if (!body) return res.status(400).json({ error: 'No body to send' })
        try {
          await sendCustomerReply({ to_email: row.from_email, subject, body })
        } catch (sendErr) {
          return res.status(500).json({ error: `Send failed: ${sendErr.message}` })
        }
        const edited = (reply_subject !== undefined && reply_subject !== row.reply_subject)
                    || (reply_body !== undefined && reply_body !== row.reply_body)
        const { data: updated, error: upErr } = await supabaseAdmin
          .from('inbound_emails')
          .update({
            reply_subject: subject,
            reply_body: body,
            reply_sent_at: new Date().toISOString(),
            reply_edited_by_admin: edited,
            status: 'sent',
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .select()
          .single()
        if (upErr) throw upErr
        return res.status(200).json(updated)
      }

      // Generic field update path (status / classification / draft text edits)
      const patch = { updated_at: new Date().toISOString() }
      if (status !== undefined) {
        if (!ALLOWED_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' })
        patch.status = status
      }
      if (classification !== undefined) patch.classification = classification
      if (reply_subject !== undefined) patch.reply_subject = reply_subject
      if (reply_body !== undefined) {
        patch.reply_body = reply_body
        if (reply_body !== row.reply_body) patch.reply_edited_by_admin = true
      }

      const { data: updated, error: upErr } = await supabaseAdmin
        .from('inbound_emails')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (upErr) throw upErr
      return res.status(200).json(updated)
    }

    if (req.method === 'DELETE') {
      const { id } = req.query
      if (!id) return res.status(400).json({ error: 'Missing id' })
      const { error } = await supabaseAdmin.from('inbound_emails').delete().eq('id', id)
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    return res.status(405).end()
  } catch (err) {
    console.error('Admin inbox error:', err)
    return res.status(500).json({ error: err.message })
  }
}
