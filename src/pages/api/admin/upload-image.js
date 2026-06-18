import crypto from 'crypto'
import { supabaseAdmin } from '../../../lib/supabase'
import { validateSessionToken } from '../../../lib/session'
import { validateOrigin, rateLimit } from '../../../lib/security'

// Admin SKU-thumbnail upload. Client posts the image as a base64 data URL;
// we decode + push to the `product-images` Storage bucket under an unguessable
// filename and return the public URL (the caller saves it as the product's
// image_url via /api/admin/products). Base64 (not multipart) keeps the API
// route simple — thumbnails are small.
export const config = { api: { bodyParser: { sizeLimit: '8mb' } } }

const BUCKET = 'product-images'
const EXT_BY_TYPE = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

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
    const { dataUrl, productId } = req.body || {}
    if (typeof dataUrl !== 'string') return res.status(400).json({ error: 'dataUrl required' })
    const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
    if (!m) return res.status(400).json({ error: 'Invalid image data' })
    const contentType = m[1].toLowerCase()
    const ext = EXT_BY_TYPE[contentType]
    if (!ext) return res.status(400).json({ error: 'Only JPEG, PNG, or WebP allowed' })
    const buffer = Buffer.from(m[2], 'base64')
    if (buffer.length > 6 * 1024 * 1024) return res.status(400).json({ error: 'Image too large (max ~5 MB)' })

    // Unguessable path — a public URL can't be enumerated to a restricted SKU.
    const slug = (productId || 'sku').toString().replace(/[^a-z0-9-]/gi, '').slice(0, 40) || 'sku'
    const path = `${slug}-${crypto.randomUUID()}.${ext}`
    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType, upsert: false })
    if (error) throw error
    const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path)
    return res.status(200).json({ url: data.publicUrl })
  } catch (err) {
    console.error('[admin/upload-image]', err)
    return res.status(500).json({ error: err.message })
  }
}
