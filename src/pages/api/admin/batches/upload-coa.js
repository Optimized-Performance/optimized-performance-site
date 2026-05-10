import { supabaseAdmin } from '../../../../lib/supabase'
import { validateSessionToken } from '../../../../lib/session'
import { validateOrigin, rateLimit } from '../../../../lib/security'

const COA_BUCKET = 'coas'
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB — Vanguard COAs are typically <1 MB

// Raw-body PDF upload. Client sends the file as the entire request body with
// Content-Type: application/pdf and ?batchId=… in the query string. We avoid
// multipart/form-data here so we don't need a parser library — Vanguard COAs
// are single small PDFs, no surrounding metadata required.
export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
}

function readRawBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    req.on('data', (chunk) => {
      total += chunk.length
      if (total > maxBytes) {
        req.destroy()
        reject(new Error('Payload too large'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function requireAuth(req) {
  const token = req.headers['x-admin-token']
  return validateSessionToken(token)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 30, windowMs: 60000 })) {
    return res.status(429).json({ error: 'Too many requests' })
  }
  if (!requireAuth(req)) return res.status(401).json({ error: 'Unauthorized' })
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  const contentType = String(req.headers['content-type'] || '').toLowerCase()
  if (!contentType.startsWith('application/pdf')) {
    return res.status(400).json({ error: 'Content-Type must be application/pdf' })
  }

  const batchId = String(req.query.batchId || '').trim()
  if (!batchId) return res.status(400).json({ error: 'Missing batchId' })

  try {
    const { data: batch, error: batchErr } = await supabaseAdmin
      .from('batches')
      .select('id, sku, lot_number')
      .eq('id', batchId)
      .single()
    if (batchErr || !batch) {
      return res.status(404).json({ error: 'Batch not found' })
    }

    const body = await readRawBody(req, MAX_BYTES)
    if (body.length === 0) {
      return res.status(400).json({ error: 'Empty request body' })
    }

    // PDFs start with the magic bytes "%PDF-". Cheap sanity check that catches
    // obvious mis-uploads (image dragged in, raw text, etc.) before we waste a
    // round-trip to Storage.
    if (body.slice(0, 5).toString('ascii') !== '%PDF-') {
      return res.status(400).json({ error: 'File does not look like a PDF' })
    }

    const objectKey = `${String(batch.sku).toLowerCase()}/${String(batch.lot_number).toLowerCase()}.pdf`

    const { error: upErr } = await supabaseAdmin
      .storage
      .from(COA_BUCKET)
      .upload(objectKey, body, {
        contentType: 'application/pdf',
        upsert: true,
      })
    if (upErr) {
      console.error('[upload-coa] storage upload failed:', upErr.message)
      return res.status(500).json({ error: `Storage upload failed: ${upErr.message}` })
    }

    const { data: updated, error: updErr } = await supabaseAdmin
      .from('batches')
      .update({
        coa_pdf_path: objectKey,
        coa_uploaded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', batch.id)
      .select()
      .single()
    if (updErr) {
      console.error('[upload-coa] batch row update failed:', updErr.message)
      return res.status(500).json({ error: `Row update failed: ${updErr.message}` })
    }

    return res.status(200).json({
      ok: true,
      batch: updated,
      coaUrl: `/coa/${encodeURIComponent(batch.sku)}/${encodeURIComponent(batch.lot_number)}`,
      bytes: body.length,
    })
  } catch (err) {
    if (err.message === 'Payload too large') {
      return res.status(413).json({ error: 'PDF exceeds 10 MB' })
    }
    console.error('[upload-coa] error:', err)
    return res.status(500).json({ error: err.message })
  }
}
