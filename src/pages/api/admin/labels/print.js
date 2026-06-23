import { supabaseAdmin } from '../../../../lib/supabase'
import { validateSessionToken } from '../../../../lib/session'
import { validateOrigin, rateLimit } from '../../../../lib/security'
import QRCode from 'qrcode'
import sharp from 'sharp'

function requireAuth(req) {
  const token = req.headers['x-admin-token']
  return validateSessionToken(token)
}

// Phomemo label media: 40mm × 30mm rolls. 4-up grid — print one label,
// two scissor cuts (vertical + horizontal at midpoints) = four ~20×15mm
// QR tiles per label. The Avery WePrint brand label sits on the vial
// body carrying SKU + EXP + RUO; the Phomemo sticker overlays a portion
// of it with a scannable QR pointer to the COA. Lot + SKU are encoded
// in the QR URL (/coa/{sku}/{lot}), so the sticker is QR-only — no
// inline text needed.
//
// Media-size history:
//   v1: 40×14mm 2-up — failed. Phomemo gap sensor can't lock onto
//       die-cut gaps below ~20mm label height.
//   v2: 50.8×25.4mm 4-up — printed clean but 25.4mm-wide individual
//       tiles took too much vial circumference (3mL vial has ~25mm
//       clear arc beside the Avery label, leaving zero margin).
//   v3 (this): 40×30mm 4-up — 30mm height is comfortably above the
//       gap-sensor threshold; 20mm tile width sits inside the vial's
//       clear arc with margin; 13mm QR is a meaningful scan-reliability
//       upgrade over v2's 11mm.
//
// 203 DPI is the Phomemo native resolution. 40mm × 30mm at 203 DPI = 320×240 px.
const DPI = 203
const MM_TO_PX = DPI / 25.4
const LABEL_W_MM = 40
const LABEL_H_MM = 30
const LABEL_W = Math.round(LABEL_W_MM * MM_TO_PX)  // 320
const LABEL_H = Math.round(LABEL_H_MM * MM_TO_PX)  // 240
const TILE_W = Math.round(LABEL_W / 2)  // 160 — 20mm
const TILE_H = Math.round(LABEL_H / 2)  // 120 — 15mm

// QR ~13 mm sq — sized to fit within the 15mm tile height with a 1mm
// quiet-zone gap. With the current ~62-char URL in byte mode at 'L' error
// correction, that lands at QR version 4 (33×33 modules) = ~0.39 mm per
// module on the printout — comfortably in phone-camera readable range.
// If real-world scans ever suffer, the lever to pull is path-normalization
// middleware that lets us encode the URL as uppercase alphanumeric
// (drops to version 3, 29 modules, ~0.45 mm/module).
const QR_SIZE = 104  // ~13 mm

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://syngyn.co'

async function buildLabelSvg({ qrPng }) {
  const qrDataUri = `data:image/png;base64,${qrPng.toString('base64')}`

  // 4-up grid: 2 cols × 2 rows of identical QR tiles. User makes two
  // scissor cuts (vertical at TILE_W, horizontal at TILE_H) → 4 stickers.
  // QR is centered within each tile with a 1px quiet-zone gap.
  function tile(xOffset, yOffset) {
    const qrX = xOffset + (TILE_W - QR_SIZE) / 2
    const qrY = yOffset + (TILE_H - QR_SIZE) / 2
    return `<image href="${qrDataUri}" x="${qrX}" y="${qrY}" width="${QR_SIZE}" height="${QR_SIZE}" />`
  }

  // Subtle cross-shaped cut guide: one vertical + one horizontal at midpoints
  const cutGuide = `
    <line x1="${TILE_W}" y1="0" x2="${TILE_W}" y2="${LABEL_H}"
          stroke="#bbb" stroke-width="1" stroke-dasharray="3,3" />
    <line x1="0" y1="${TILE_H}" x2="${LABEL_W}" y2="${TILE_H}"
          stroke="#bbb" stroke-width="1" stroke-dasharray="3,3" />
  `

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${LABEL_W}" height="${LABEL_H}" viewBox="0 0 ${LABEL_W} ${LABEL_H}">
    <rect width="${LABEL_W}" height="${LABEL_H}" fill="#fff" />
    ${tile(0, 0)}
    ${tile(TILE_W, 0)}
    ${tile(0, TILE_H)}
    ${tile(TILE_W, TILE_H)}
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

    const svg = await buildLabelSvg({ qrPng })

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
