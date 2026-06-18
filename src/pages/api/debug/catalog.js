// TEMPORARY debug endpoint — REMOVE after diagnosing the 500.
// Replays the homepage getServerSideProps path step-by-step and reports which
// step throws (and the full JSON-serialization test), since getCatalog itself
// is already confirmed working.
import { supabaseAdmin } from '../../../lib/supabase'

export default async function handler(req, res) {
  const out = { hasAdmin: !!supabaseAdmin, steps: {} }
  try {
    const { getCohortFromRequest } = require('../../../lib/cohort-session')
    const { hasGatedAccess } = require('../../../lib/gated-access')
    const { getVisibleProductsForCohort } = require('../../../data/products')

    let cohortAllowed = null
    try {
      const c = await getCohortFromRequest({ req, res, query: req.query }, supabaseAdmin)
      cohortAllowed = c ? c.cohortAllowed : null
      out.steps.cohort = `ok (cohortAllowed=${cohortAllowed})`
    } catch (e) { out.steps.cohort = 'THREW: ' + e.message; throw e }

    let gated = null
    try { gated = await hasGatedAccess(req); out.steps.gated = `ok (${gated})` }
    catch (e) { out.steps.gated = 'THREW: ' + e.message; throw e }

    let vp = null
    try { vp = await getVisibleProductsForCohort(cohortAllowed, gated); out.steps.visible = `ok (${vp.length} products)` }
    catch (e) { out.steps.visible = 'THREW: ' + e.message; throw e }

    try { JSON.stringify(vp); out.steps.serialize = 'ok' }
    catch (e) { out.steps.serialize = 'THREW: ' + e.message; throw e }

    out.ok = true
  } catch (err) {
    out.ok = false
    out.error = err && err.message ? err.message : String(err)
    out.stack = (err && err.stack ? err.stack : '').split('\n').slice(0, 6)
  }
  return res.status(200).json(out)
}
