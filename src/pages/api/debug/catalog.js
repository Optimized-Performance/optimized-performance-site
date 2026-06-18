// TEMPORARY debug endpoint — REMOVE after diagnosing. Probes the module exports
// to find why hasGatedAccess resolves undefined at the require site.
import { supabaseAdmin } from '../../../lib/supabase'

export default async function handler(req, res) {
  const out = { hasAdmin: !!supabaseAdmin, probes: {} }
  try {
    const ga = require('../../../lib/gated-access')
    out.probes.gatedKeys = Object.keys(ga)
    out.probes.hasGatedAccessType = typeof ga.hasGatedAccess
    out.probes.gatedDefaultType = typeof ga.default
    out.probes.gatedDefaultKeys = ga.default && typeof ga.default === 'object' ? Object.keys(ga.default) : null
  } catch (e) { out.probes.gatedRequire = 'THREW: ' + e.message }
  try {
    const cs = require('../../../lib/customer-session')
    out.probes.csKeys = Object.keys(cs)
    out.probes.getCustomerIdFromReqType = typeof cs.getCustomerIdFromReq
  } catch (e) { out.probes.csRequire = 'THREW: ' + e.message }
  return res.status(200).json(out)
}
