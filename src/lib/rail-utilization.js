// Payment-rail orchestration — utilization + availability.
//
// Backs the rail-throttle engine (docs/rail-orchestration-spec.md): sums settled
// per-rail volume for the current month/day and decides which rails are still
// under their cap. Crypto + Zelle are uncapped (NULL monthly_cap) = always
// available release valves. Authoritative throttle lives in api/orders/create.js
// (server-side); checkout.js uses /api/rails/availability for UI gating only.

const DAILY_BUFFER = 1.5 // derived daily cap = monthly/30 * buffer (lumpiness headroom)

// Sum settled (completed) order volume per payment_method for the current month
// (MTD) and day (DTD), plus in-flight (pending/awaiting) tracked separately for
// admin visibility. Mirrors the per-period sum pattern in cron/affiliate-monthly.
export async function getRailUtilization(supabaseAdmin, now = new Date()) {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  const d = now.getUTCDate()
  const monthStart = new Date(Date.UTC(y, m, 1)).toISOString()
  const dayStart = new Date(Date.UTC(y, m, d)).toISOString()

  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('total, payment_method, payment_status, created_at')
    .gte('created_at', monthStart)
  if (error) throw error

  const util = {}
  const bucket = (rail) => {
    if (!util[rail]) util[rail] = { mtd: 0, dtd: 0, inflight_mtd: 0 }
    return util[rail]
  }
  for (const o of data || []) {
    const u = bucket(o.payment_method || 'unknown')
    const amt = Number(o.total || 0)
    if (o.payment_status === 'completed') {
      u.mtd += amt
      if (o.created_at >= dayStart) u.dtd += amt
    } else if (o.payment_status === 'pending' || o.payment_status === 'awaiting_payment') {
      u.inflight_mtd += amt
    }
    // 'abandoned' / 'blocked' / refunds excluded — they don't consume rail capacity.
  }
  return util
}

export async function getRailConfig(supabaseAdmin) {
  const { data, error } = await supabaseAdmin.from('rail_config').select('*')
  if (error) throw error
  const map = {}
  for (const r of data || []) map[r.rail] = r
  return map
}

// Merge config + utilization into a per-rail availability view.
export function railAvailability(config, util) {
  const round = (n) => Math.round(n * 100) / 100
  const out = {}
  for (const rail of Object.keys(config)) {
    const c = config[rail]
    const u = util[rail] || { mtd: 0, dtd: 0, inflight_mtd: 0 }
    const monthlyCap = c.monthly_cap == null ? null : Number(c.monthly_cap)
    let dailyCap = c.daily_cap == null ? null : Number(c.daily_cap)
    if (dailyCap == null && monthlyCap != null) dailyCap = Math.round((monthlyCap / 30) * DAILY_BUFFER)
    const underMonthly = monthlyCap == null || u.mtd < monthlyCap
    const underDaily = dailyCap == null || u.dtd < dailyCap
    out[rail] = {
      rail,
      enabled: !!c.enabled,
      available: !!c.enabled && underMonthly && underDaily,
      mtd: round(u.mtd),
      dtd: round(u.dtd),
      inflight_mtd: round(u.inflight_mtd),
      monthly_cap: monthlyCap,
      daily_cap: dailyCap,
      remaining_monthly: monthlyCap == null ? null : Math.max(0, round(monthlyCap - u.mtd)),
      remaining_daily: dailyCap == null ? null : Math.max(0, round(dailyCap - u.dtd)),
    }
  }
  return out
}

// Convenience for api/orders/create.js — is this rail under cap right now?
// Fail-open: a rail with no config row has no cap (returns true).
export async function isRailAvailable(supabaseAdmin, rail) {
  try {
    const config = await getRailConfig(supabaseAdmin)
    if (!config[rail]) return true
    const util = await getRailUtilization(supabaseAdmin)
    const avail = railAvailability(config, util)
    return avail[rail] ? avail[rail].available : true
  } catch (err) {
    // Fail-open: if rail_config is missing (migration v22 not yet run) or any
    // query errors, NEVER block a sale. The throttle is best-effort; a config
    // outage must not take checkout down.
    console.error('isRailAvailable error (fail-open):', err.message)
    return true
  }
}
