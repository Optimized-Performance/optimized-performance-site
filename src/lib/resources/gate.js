import { getCustomerIdFromReq } from '../customer-session'

// Gate for the members-only /resources surface (pages + the tool-serving API
// route). Re-keyed 2026-07-23 from the referral-cohort credential to the
// ACCOUNT session: any signed-in customer may use the member tools, signed-out
// visitors get a hard 404. Same members-area pattern as the rest of the site
// since the login wall — plain authentication, no cookie-conditional cloaking
// shape.
//
// RESOURCES_OFF=true is the tools' own kill-switch — flips the whole surface
// to 404 for everyone (default: unset = live for signed-in members).
export async function resourcesAllowed(context) {
  if (process.env.RESOURCES_OFF === 'true') return false
  return !!getCustomerIdFromReq(context?.req)
}
