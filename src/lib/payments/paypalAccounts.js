// ============================================================
// PayPal multi-account registry + weighted selection.
// ============================================================
//
// Why: spreading checkout volume across multiple PayPal business accounts
// (OPP + Ethan's entity, LLC later) so no single account carries the whole
// load — the July-volume rail-resilience play. PayPal Smart Buttons tie the
// SDK clientId (client) to the account that captures the money (server
// secret), so an order must use ONE account end-to-end: the clientId that
// rendered its buttons, the secret that creates+captures it, and the
// webhook_id that verifies its events all have to belong to the same account.
//
// Selection is SERVER-AUTHORITATIVE and per-checkout-load: /api/payments/
// paypal-account picks a weighted account and hands the client only that
// account's (public) clientId. Weights live in server env (not NEXT_PUBLIC),
// so the split can be retuned in Vercel WITHOUT a rebuild, and secrets never
// reach the browser.
//
// INERT BY DEFAULT: OPP weight defaults to 100, every other account to 0, so
// until a non-OPP weight is set in env the behavior is byte-for-byte identical
// to the single-account flow. Adding the LLC later = one more entry here + its
// env vars; no money-path code change.
//
// Backward compat: orders predating this have paypal_account = null →
// resolvePaypalAccount(null) returns OPP. OPP reads the EXISTING env var names
// so nothing about the current live account changes.

const ENV = () => (process.env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox')

// Each account declares where to read its four credentials from. OPP keeps the
// original (un-suffixed) names; new accounts use a _<KEY> suffix.
const ACCOUNT_DEFS = [
  {
    key: 'opp',
    label: 'Optimized Performance Inc.',
    clientIdEnv: 'NEXT_PUBLIC_PAYPAL_CLIENT_ID',
    secretEnv: 'PAYPAL_CLIENT_SECRET',
    webhookIdEnv: 'PAYPAL_WEBHOOK_ID',
    weightEnv: 'PAYPAL_WEIGHT_OPP',
    defaultWeight: 100, // OPP carries everything until other weights are set
  },
  {
    key: 'ethan',
    label: "Ethan's entity",
    clientIdEnv: 'PAYPAL_CLIENT_ID_ETHAN',
    secretEnv: 'PAYPAL_CLIENT_SECRET_ETHAN',
    webhookIdEnv: 'PAYPAL_WEBHOOK_ID_ETHAN',
    weightEnv: 'PAYPAL_WEIGHT_ETHAN',
    defaultWeight: 0, // off until Matt sets a weight in Vercel
  },
  {
    key: 'llc',
    label: 'New LLC',
    clientIdEnv: 'PAYPAL_CLIENT_ID_LLC',
    secretEnv: 'PAYPAL_CLIENT_SECRET_LLC',
    webhookIdEnv: 'PAYPAL_WEBHOOK_ID_LLC',
    weightEnv: 'PAYPAL_WEIGHT_LLC',
    defaultWeight: 0, // off until Matt sets a weight in Vercel
  },
]

function parseWeight(raw, fallback) {
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

// Resolve one def against the current env into a usable account object.
function resolveDef(def) {
  const clientId = process.env[def.clientIdEnv] || null
  const secret = process.env[def.secretEnv] || null
  const webhookId = process.env[def.webhookIdEnv] || null
  const weight = parseWeight(process.env[def.weightEnv], def.defaultWeight)
  // "configured" = enough creds to actually create+capture+verify an order.
  const configured = !!(clientId && secret && webhookId)
  return {
    key: def.key,
    label: def.label,
    clientId,
    secret,
    webhookId,
    weight,
    env: ENV(),
    configured,
    // selectable for NEW orders only when fully configured AND given weight.
    selectable: configured && weight > 0,
  }
}

export function getAllPaypalAccounts() {
  return ACCOUNT_DEFS.map(resolveDef)
}

// The OPP account is the canonical default/fallback — always resolved, used
// for legacy orders (null paypal_account) and as the last-resort selection so
// checkout never breaks even if every weight is misconfigured to 0.
export function getDefaultPaypalAccount() {
  return resolveDef(ACCOUNT_DEFS[0])
}

// Resolve a stored key (from orders.paypal_account) back to its account for
// capture / webhook handling. Unknown/blank/legacy → OPP.
export function resolvePaypalAccount(key) {
  if (!key || key === 'opp') return getDefaultPaypalAccount()
  const def = ACCOUNT_DEFS.find((d) => d.key === key)
  if (!def) return getDefaultPaypalAccount()
  const resolved = resolveDef(def)
  // If a once-configured account lost its creds, don't dead-end an in-flight
  // order — fall back to OPP so capture/verify still has something to use.
  return resolved.configured ? resolved : getDefaultPaypalAccount()
}

// Weighted pick across selectable accounts for a NEW checkout. Server-side
// only. Deterministic fallback to OPP when nothing else is selectable.
export function selectPaypalAccount() {
  const selectable = getAllPaypalAccounts().filter((a) => a.selectable)
  if (selectable.length === 0) return getDefaultPaypalAccount()
  if (selectable.length === 1) return selectable[0]

  const totalWeight = selectable.reduce((sum, a) => sum + a.weight, 0)
  if (totalWeight <= 0) return getDefaultPaypalAccount()

  let r = Math.random() * totalWeight
  for (const acct of selectable) {
    r -= acct.weight
    if (r < 0) return acct
  }
  return selectable[selectable.length - 1] // float-rounding safety net
}
