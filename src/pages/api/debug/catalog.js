// TEMPORARY debug endpoint — REMOVE after diagnosing. Replays the shop/index
// getServerSideProps path with the SAME static imports the pages use, honoring
// ?ref so the cohort branch can be reproduced. Hit /api/debug/catalog?ref=TRIS.
import { supabaseAdmin } from '../../../lib/supabase'
import { getCohortFromRequest } from '../../../lib/cohort-session'
import { hasGatedAccess } from '../../../lib/gated-access'
import { getVisibleCatalog } from '../../../lib/catalog'

export default async function handler(req, res) {
  const out = { steps: {}, ref: req.query.ref || null }
  try {
    let cohortAllowed = null
    try {
      const c = await getCohortFromRequest({ req, res, query: req.query }, supabaseAdmin)
      cohortAllowed = c ? c.cohortAllowed : null
      out.steps.cohort = `ok (cohortAllowed=${cohortAllowed})`
    } catch (e) { out.steps.cohort = 'THREW: ' + e.message; throw e }

    let gated = false
    try { gated = await hasGatedAccess(req); out.steps.gated = `ok (${gated})` }
    catch (e) { out.steps.gated = 'THREW: ' + e.message; throw e }

    let vp = []
    try { vp = await getVisibleCatalog({ cohort: cohortAllowed, gatedAccess: gated }); out.steps.visible = `ok (${vp.length} products)` }
    catch (e) { out.steps.visible = 'THREW: ' + e.message; throw e }

    try { JSON.stringify(vp); out.steps.serialize = 'ok' }
    catch (e) { out.steps.serialize = 'THREW: ' + e.message; throw e }

    out.ok = true
    out.visibleCount = vp.length
    out.ids = vp.map((p) => p.id)
  } catch (err) {
    out.ok = false
    out.error = err && err.message ? err.message : String(err)
    out.stack = (err && err.stack ? err.stack : '').split('\n').slice(0, 6)
  }
  return res.status(200).json(out)
}
