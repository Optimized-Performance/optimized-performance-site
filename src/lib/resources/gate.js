import { getCohortFromRequest } from '../cohort-session'
import { supabaseAdmin } from '../supabase'

// Gate for the members-only /resources surface (pages + the tool-serving API
// route). STRICT cohort check: unlike the catalog, this does NOT honor the
// COHORT_GATE_OFF conversion kill-switch — a cold visitor (and any AUP
// scanner) gets a hard 404 no matter what posture the catalog is in. Only a
// real credential (?cohort= allowlist token, ?ref= active affiliate, or a
// valid opp_cohort cookie) opens it.
//
// RESOURCES_OFF=true is the tools' own kill-switch — flips the whole surface
// to 404 for everyone (default: unset = live for cohort).
export async function resourcesAllowed(context) {
  if (process.env.RESOURCES_OFF === 'true') return false
  const { cohortAllowed } = await getCohortFromRequest(context, supabaseAdmin, { strict: true })
  return cohortAllowed
}
