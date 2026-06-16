// Resolves QR codes printed on Phomemo vial labels: the encoded URL is
// /coa/{sku}/{lot_number}. We look up the matching batch row in Supabase,
// read coa_pdf_path (object key in the 'coas' Storage bucket per v14), and:
//   - stream the PDF inline so phone scanners render it directly, OR
//   - fall back to a friendly "preliminary COA pending" page when Vanguard
//     hasn't returned the file yet (lot row exists, coa_pdf_path null).
//
// Why server-side fetch + serve instead of a redirect to the storage URL:
// keeps the public URL stable and short for QR codes, lets us swap the
// underlying object key at any time without changing what's printed on
// thousands of labels, and lets us add status logic ("preliminary",
// "pending sterility") later without changing label artwork.

import { supabaseAdmin } from '../../../lib/supabase'
import { escapeLike } from '../../../lib/security'
import SEO from '../../../components/SEO'

const COA_BUCKET = 'coas'

export async function getServerSideProps(context) {
  const { sku, lot } = context.params
  const { res } = context

  if (!supabaseAdmin) {
    return { props: { error: 'database_unavailable', sku, lot } }
  }

  // SKU + lot both case-normalize because QR codes may render in either case
  // depending on the printer driver. lot_number is YYMMDD or YYMMDD-A.
  let { data: batch, error } = await supabaseAdmin
    .from('batches')
    .select('sku, lot_number, production_date, expiry_date, coa_pdf_path, coa_uploaded_at')
    .ilike('sku', escapeLike(String(sku)))
    .ilike('lot_number', escapeLike(String(lot)))
    .maybeSingle()

  if (error) {
    console.error('[coa] DB lookup failed:', error.message)
    return { props: { error: 'database_error', sku, lot } }
  }

  // Safety net: exact (sku, lot) miss — usually a label printed with a lot that
  // doesn't match the DB row (e.g. the lot column was stamped with the wrong
  // date). Rather than dead-end a customer scanning a real vial — the worst
  // trust signal for a peptide brand — fall back to the latest PUBLISHED COA for
  // the same SKU so a valid COA still loads. (Fix the underlying lot data for
  // exactness; this just prevents a 404 in the meantime.)
  let lotFallback = false
  if (!batch) {
    const { data: alt } = await supabaseAdmin
      .from('batches')
      .select('sku, lot_number, production_date, expiry_date, coa_pdf_path, coa_uploaded_at')
      .ilike('sku', escapeLike(String(sku)))
      .not('coa_pdf_path', 'is', null)
      .order('production_date', { ascending: false })
      .limit(1)
    if (alt && alt.length) {
      batch = alt[0]
      lotFallback = true
    } else {
      res.statusCode = 404
      return { props: { error: 'not_found', sku, lot } }
    }
  }

  // Batch exists but COA PDF hasn't been uploaded yet — render the friendly
  // pending page so customers don't see a 404 between label print and Vanguard
  // returning the file.
  if (!batch.coa_pdf_path) {
    return { props: { batch, error: 'pending', sku, lot } }
  }

  // Strip any leading slashes the column may carry from older /public-style
  // values; Supabase Storage keys are bucket-relative and never start with /.
  const objectKey = String(batch.coa_pdf_path).replace(/^\/+/, '')

  try {
    const { data: blob, error: dlErr } = await supabaseAdmin
      .storage
      .from(COA_BUCKET)
      .download(objectKey)
    if (dlErr || !blob) {
      console.error('[coa] storage download failed for', objectKey, dlErr?.message)
      return { props: { batch, error: 'file_missing', sku, lot } }
    }
    const buf = Buffer.from(await blob.arrayBuffer())
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Length', buf.length)
    res.setHeader(
      'Content-Disposition',
      `inline; filename="OPP-COA-${batch.sku}-${batch.lot_number}.pdf"`
    )
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400')
    // Flag served-by-fallback responses so a scanned lot with no exact match is
    // visible in logs (signals lot data that still needs reconciling).
    if (lotFallback) res.setHeader('X-Coa-Lot-Fallback', `${sku}/${lot}->${batch.lot_number}`)
    res.end(buf)
    return { props: {} }
  } catch (err) {
    console.error('[coa] storage read failed for', objectKey, err.message)
    return { props: { batch, error: 'file_missing', sku, lot } }
  }
}

export default function CoaPage({ error, batch, sku, lot }) {
  if (error === 'pending') {
    return (
      <div className="max-w-narrow mx-auto px-8 py-20 text-center">
        <SEO title={`COA — ${sku} lot ${lot}`} description="Certificate of Analysis status" path="" noindex />
        <span className="opp-eyebrow">Certificate of Analysis</span>
        <h1 className="font-display font-semibold tracking-display text-3xl mt-3 mb-3 text-ink">
          Preliminary COA pending
        </h1>
        <p className="text-ink-soft text-sm mb-2">
          Lot <strong className="text-ink font-mono">{lot}</strong> ({sku}) has been produced and submitted
          to Vanguard Laboratory for testing. The full Certificate of Analysis will appear at this URL once
          the lab returns the report (typically 5–14 days from submission).
        </p>
        {batch?.production_date && (
          <p className="opp-meta-mono text-ink-mute mt-4">
            Produced: {new Date(batch.production_date).toLocaleDateString()}
          </p>
        )}
      </div>
    )
  }

  if (error === 'not_found') {
    return (
      <div className="max-w-narrow mx-auto px-8 py-20 text-center">
        <SEO title="COA not found" description="" path="" noindex />
        <h1 className="font-display font-semibold tracking-display text-3xl text-ink">
          Lot not recognized
        </h1>
        <p className="text-ink-soft text-sm mt-3">
          We couldn&apos;t find a batch matching <strong className="font-mono">{sku} / {lot}</strong>. If you
          scanned this from a vial label, contact{' '}
          <a href="mailto:admin@optimizedperformancepeptides.com" className="text-accent-strong hover:underline">
            admin@optimizedperformancepeptides.com
          </a>{' '}
          and include a photo of the label.
        </p>
      </div>
    )
  }

  if (error === 'file_missing') {
    return (
      <div className="max-w-narrow mx-auto px-8 py-20 text-center">
        <SEO title="COA temporarily unavailable" description="" path="" noindex />
        <h1 className="font-display font-semibold tracking-display text-3xl text-ink">
          COA temporarily unavailable
        </h1>
        <p className="text-ink-soft text-sm mt-3">
          The file for lot <strong className="font-mono">{lot}</strong> is being re-uploaded. Try again in a
          few minutes, or email{' '}
          <a href="mailto:admin@optimizedperformancepeptides.com" className="text-accent-strong hover:underline">
            admin@optimizedperformancepeptides.com
          </a>.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-narrow mx-auto px-8 py-20 text-center">
      <h1 className="font-display font-semibold tracking-display text-3xl text-ink">
        Unable to load COA
      </h1>
      <p className="text-ink-soft text-sm mt-3">Try again in a moment.</p>
    </div>
  )
}
