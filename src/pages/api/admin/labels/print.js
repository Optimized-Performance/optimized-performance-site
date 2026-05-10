import { supabaseAdmin } from '../../../../lib/supabase'
import { validateSessionToken } from '../../../../lib/session'
import { validateOrigin, rateLimit } from '../../../../lib/security'
import QRCode from 'qrcode'
import sharp from 'sharp'

function requireAuth(req) {
  const token = req.headers['x-admin-token']
  return validateSessionToken(token)
}

// Phomemo label media: 40mm × 14mm rolls. Two-up layout — print pair, cut in
// half = two ~20×14mm tiles per label. The Avery WePrint brand label sits on
// the vial body and the Phomemo sticker overlays a portion of it carrying the
// QR + LOT, since the 3 mL vial doesn't have room for two side-by-side
// stickers. Avery already carries SKU + EXP + RUO, so this sticker only needs
// the QR pointer + LOT for traceability.
//
// 203 DPI is the Phomemo native resolution. 40mm × 14mm at 203 DPI = 320×112 px.
const DPI = 203
const MM_TO_PX = DPI / 25.4
const LABEL_W_MM = 40
const LABEL_H_MM = 14
const LABEL_W = Math.round(LABEL_W_MM * MM_TO_PX)  // 320
const LABEL_H = Math.round(LABEL_H_MM * MM_TO_PX)  // 112
const TILE_W = LABEL_W / 2 // 160

// QR ~12 mm sq. With the current ~62-char URL in byte mode at 'L' error
// correction, that lands at QR version 4 (33×33 modules) = ~0.36 mm per
// module on the printout — at the lower end of phone-camera comfort but
// scannable in normal light. If real-world scans suffer, the lever to pull
// is path-normalization middleware that lets us encode the URL as uppercase
// alphanumeric (drops to version 3, 29 modules, ~0.41 mm/module).
const QR_SIZE = 96 // ~12 mm

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://optimizedperformancepeptides.com'

function escapeXml(s) {
  return String(s).replace(/[<>&"']/g, (c) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;',
  }[c]))
}

async function buildLabelSvg({ qrPng, lotNumber }) {
  const qrDataUri = `data:image/png;base64,${qrPng.toString('base64')}`
  const lotText = escapeXml(`LOT ${lotNumber}`)

  // Two-up: identical content twice; user cuts down the middle. Each tile
  // gets centered QR (top) + LOT text (bottom). Top margin is 2 px (white
  // space already in QR's quiet zone), bottom margin gives ~12 px for an
  // 11pt LOT line.
  function tile(xOffset) {
    const qrX = xOffset + (TILE_W - QR_SIZE) / 2
    return `
      <image href="${qrDataUri}" x="${qrX}" y="2" width="${QR_SIZE}" height="${QR_SIZE}" />
      <text x="${xOffset + TILE_W / 2}" y="${LABEL_H - 3}" text-anchor="middle"
            font-family="Helvetica, Arial, sans-serif" font-size="11" font-weight="700" fill="#000">${lotText}</text>
    `
  }

  // Subtle middle cut guide
  const cutGuide = `<line x1="${TILE_W}" y1="0" x2="${TILE_W}" y2="${LABEL_H}"
                          stroke="#bbb" stroke-width="1" stroke-dasharray="3,3" />`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${LABEL_W}" height="${LABEL_H}" viewBox="0 0 ${LABEL_W} ${LABEL_H}">
    <rect width="${LABEL_W}" height="${LABEL_H}" fill="#fff" />
    ${tile(0)}
    ${tile(TILE_W)}
    ${cutGuide}
  </svg>`
}

export default async function handler(req, res) {
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 60, windowMs: 60000 })) {
    return res.status(429).json({ error: 'Too many requests' })
  }
  if (!requireAuth(req)) return res.status(401).json({ error: 'Unauthorized' })
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  if (req.method !== 'POST') return res.status(405).end()

  try {
    const { batchId, qty } = req.body
    if (!batchId) return res.status(400).json({ error: 'Missing batchId' })
    const printQty = Math.max(1, Math.min(parseInt(qty) || 1, 1000))

    const { data: batch, error: batchErr } = await supabaseAdmin
      .from('batches')
      .select('id, sku, lot_number, expiry_date')
      .eq('id', batchId)
      .single()
    if (batchErr || !batch) {
      return res.status(404).json({ error: 'Batch not found' })
    }

    const coaUrl = `${SITE_URL}/coa/${encodeURIComponent(batch.sku)}/${encodeURIComponent(batch.lot_number)}`
    const qrPng = await QRCode.toBuffer(coaUrl, {
      errorCorrectionLevel: 'L',
      margin: 1,
      width: QR_SIZE,
      color: { dark: '#000000', light: '#FFFFFF' },
    })

    const svg = await buildLabelSvg({
      qrPng,
      lotNumber: batch.lot_number,
    })

    const png = await sharp(Buffer.from(svg)).png().toBuffer()

    // Audit log: every print is recorded for inventory reconciliation, recall
    // traceability, and chargeback evidence. Failure here doesn't block the
    // download — the label is more important than the log row.
    await supabaseAdmin
      .from('label_prints')
      .insert({
        batch_id: batch.id,
        qty: printQty,
        printed_by: 'admin',
      })
      .then(({ error }) => {
        if (error) console.error('[labels/print] audit log insert failed:', error.message)
      })

    res.setHeader('Content-Type', 'image/png')
    res.setHeader(
      'Content-Disposition',
      `inline; filename="label_${batch.sku}_${batch.lot_number}_x${printQty}.png"`,
    )
    res.setHeader('X-Print-Qty', String(printQty))
    res.setHeader('X-Coa-Url', coaUrl)
    return res.status(200).send(png)
  } catch (err) {
    console.error('[labels/print] error:', err)
    return res.status(500).json({ error: err.message })
  }
}

export const config = {
  api: {
    responseLimit: '4mb',
  },
}
