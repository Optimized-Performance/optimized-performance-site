// Product-level COA resolver for the BOX QR sticker: /coa/{sku}.
//
// Resolves to the LATEST batch for that SKU that has a COA on file and serves
// its PDF inline — so ONE static per-product QR (printed once, applied to any
// box regardless of lot) always points at the current batch's certificate. No
// per-lot sticker management. Mirrors the serve logic of /coa/{sku}/{lot}; that
// lot-specific route still works for the human-readable lot on the sticker.

import { supabaseAdmin } from '../../../lib/supabase'
import { escapeLike } from '../../../lib/security'
import SEO from '../../../components/SEO'

const COA_BUCKET = 'coas'

export async function getServerSideProps(context) {
  const { sku } = context.params
  const { res } = context

  if (!supabaseAdmin) return { props: { error: 'database_unavailable', sku } }

  // Latest COA'd batch for this SKU (most recent production date with a COA).
  const { data: rows, error } = await supabaseAdmin
    .from('batches')
    .select('sku, lot_number, production_date, expiry_date, coa_pdf_path')
    .ilike('sku', escapeLike(String(sku)))
    .not('coa_pdf_path', 'is', null)
    .order('production_date', { ascending: false })
    .limit(1)

  if (error) {
    console.error('[coa/sku] DB lookup failed:', error.message)
    return { props: { error: 'database_error', sku } }
  }

  const batch = rows && rows.length ? rows[0] : null

  // No COA'd batch yet: distinguish "a batch exists, COA pending" from "unknown SKU".
  if (!batch) {
    const { data: any } = await supabaseAdmin
      .from('batches')
      .select('sku, lot_number, production_date')
      .ilike('sku', escapeLike(String(sku)))
      .order('production_date', { ascending: false })
      .limit(1)
    if (any && any.length) return { props: { error: 'pending', sku, batch: any[0] } }
    res.statusCode = 404
    return { props: { error: 'not_found', sku } }
  }

  const objectKey = String(batch.coa_pdf_path).replace(/^\/+/, '')
  try {
    const { data: blob, error: dlErr } = await supabaseAdmin.storage.from(COA_BUCKET).download(objectKey)
    if (dlErr || !blob) {
      console.error('[coa/sku] storage download failed for', objectKey, dlErr?.message)
      return { props: { error: 'file_missing', sku } }
    }
    const buf = Buffer.from(await blob.arrayBuffer())
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Length', buf.length)
    res.setHeader('Content-Disposition', `inline; filename="OPP-COA-${batch.sku}-${batch.lot_number}.pdf"`)
    // Shorter cache than the lot route: the "latest" target moves when a newer
    // batch's COA is uploaded, so don't pin it for a day.
    res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=3600')
    res.end(buf)
    return { props: {} }
  } catch (err) {
    console.error('[coa/sku] storage read failed for', objectKey, err.message)
    return { props: { error: 'file_missing', sku } }
  }
}

export default function ProductCoaPage({ error, sku, batch }) {
  if (error === 'pending') {
    return (
      <div className="max-w-narrow mx-auto px-8 py-20 text-center">
        <SEO title={`COA — ${sku}`} description="Certificate of Analysis status" path="" noindex />
        <span className="opp-eyebrow">Certificate of Analysis</span>
        <h1 className="font-display font-semibold tracking-display text-3xl mt-3 mb-3 text-ink">
          COA pending
        </h1>
        <p className="text-ink-soft text-sm mb-2">
          The current batch of <strong className="text-ink font-mono">{sku}</strong> has been submitted to
          Vanguard Laboratory for testing. The full Certificate of Analysis will appear here once the lab
          returns the report (typically 5–14 days).
        </p>
        {batch?.production_date && (
          <p className="opp-meta-mono text-ink-mute mt-4">Produced: {new Date(batch.production_date).toLocaleDateString()}</p>
        )}
      </div>
    )
  }

  if (error === 'not_found') {
    return (
      <div className="max-w-narrow mx-auto px-8 py-20 text-center">
        <SEO title="COA not found" description="" path="" noindex />
        <h1 className="font-display font-semibold tracking-display text-3xl text-ink">Product not recognized</h1>
        <p className="text-ink-soft text-sm mt-3">
          We couldn&apos;t find any batch for <strong className="font-mono">{sku}</strong>. If you scanned this
          from a box, contact{' '}
          <a href="mailto:support@syngyn.co" className="text-accent-strong hover:underline">support@syngyn.co</a>{' '}
          with a photo of the label.
        </p>
      </div>
    )
  }

  if (error === 'file_missing') {
    return (
      <div className="max-w-narrow mx-auto px-8 py-20 text-center">
        <SEO title="COA temporarily unavailable" description="" path="" noindex />
        <h1 className="font-display font-semibold tracking-display text-3xl text-ink">COA temporarily unavailable</h1>
        <p className="text-ink-soft text-sm mt-3">
          The certificate for <strong className="font-mono">{sku}</strong> is being re-uploaded. Try again in a
          few minutes, or email{' '}
          <a href="mailto:support@syngyn.co" className="text-accent-strong hover:underline">support@syngyn.co</a>.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-narrow mx-auto px-8 py-20 text-center">
      <h1 className="font-display font-semibold tracking-display text-3xl text-ink">Unable to load COA</h1>
      <p className="text-ink-soft text-sm mt-3">Try again in a moment.</p>
    </div>
  )
}
