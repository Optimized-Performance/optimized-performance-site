import { supabaseAdmin } from '../../../lib/supabase'
import { commissionableTotal } from '../../../lib/commission'
import { ROYALTY_PCT } from '../../../lib/affiliate-config'
import { isAuthorizedCron } from '../../../lib/cron-auth'

// Monthly affiliate processing job.
// Runs on the 1st of each month at 09:00 UTC via Vercel Cron (vercel.json).
// Manual trigger: POST with header x-cron-secret: $CRON_SECRET.
//
// Steps (per docs/affiliate-program-spec.md):
//   1. Tier ratchet for non-flat-rate affiliates based on prior-month attributed volume,
//      adjusted by recruiter_override_pct if recruited.
//   2. Recruitment override payouts — for each recruit with prior-month volume > 0.
//   3. Royalty payouts — for each is_flat_rate affiliate (5% of OPP gross).
//
// Idempotent: UNIQUE (affiliate_id, payout_type, period, trigger_affiliate_id) on
// affiliate_payouts means re-running for the same period is safe.

const TIER_THRESHOLDS = [
  { min: 0,      max: 9999,    rate: 10 },
  { min: 10000,  max: 19999,   rate: 15 },
  { min: 20000,  max: 34999,   rate: 20 },
  { min: 35000,  max: 59999,   rate: 25 },
  { min: 60000,  max: Infinity, rate: 30 },
]

// ROYALTY_PCT now lives in lib/affiliate-config (shared with the dashboard).

function tierLookup(volume) {
  const v = Number(volume) || 0
  return TIER_THRESHOLDS.find((t) => v >= t.min && v <= t.max).rate
}

function previousPeriodKey(d = new Date()) {
  const prev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`
}

function periodRange(pk) {
  const [y, m] = pk.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, 1))
  const end = new Date(Date.UTC(y, m, 1))
  return { start: start.toISOString(), end: end.toISOString() }
}

async function sumOrders(code, pk) {
  const { start, end } = periodRange(pk)
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('total, shipping')
    .eq('affiliate_code', code)
    .eq('payment_status', 'completed')
    .gte('created_at', start)
    .lt('created_at', end)
  if (error) throw error
  // Override payout basis: product revenue only, shipping excluded (see lib/commission).
  return (data || []).reduce((s, o) => s + commissionableTotal(o), 0)
}

async function sumGrossRevenue(pk) {
  const { start, end } = periodRange(pk)
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('total, shipping')
    .eq('payment_status', 'completed')
    .gte('created_at', start)
    .lt('created_at', end)
  if (error) throw error
  // Royalty payout basis: product revenue only, shipping excluded (see lib/commission).
  return (data || []).reduce((s, o) => s + commissionableTotal(o), 0)
}

export default async function handler(req, res) {
  if (!isAuthorizedCron(req)) return res.status(401).json({ error: 'Unauthorized' })

  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  // Allow override of period via query param for backfill / manual reruns
  const period = (req.query.period && /^\d{4}-\d{2}$/.test(req.query.period))
    ? req.query.period
    : previousPeriodKey()

  const log = {
    period,
    started_at: new Date().toISOString(),
    tier_changes: [],
    overrides_inserted: 0,
    royalties_inserted: 0,
    errors: [],
  }

  try {
    const { data: affiliates, error: affErr } = await supabaseAdmin
      .from('affiliates')
      .select('id, code, name, commission_pct, is_flat_rate, parent_affiliate_id, recruiter_override_pct, active')
      .eq('active', true)
    if (affErr) throw affErr

    const affById = new Map((affiliates || []).map((a) => [a.id, a]))

    // 1. Tier ratchet + 2. Override payouts (in same loop)
    for (const aff of affiliates || []) {
      try {
        const volume = await sumOrders(aff.code, period)

        // Tier ratchet (skip flat-rate)
        if (!aff.is_flat_rate) {
          let newRate = tierLookup(volume)
          // Recruited affiliate — subtract recruiter's override
          if (aff.parent_affiliate_id) {
            const recruiter = affById.get(aff.parent_affiliate_id)
            if (recruiter) {
              newRate = Math.max(0, newRate - Number(recruiter.recruiter_override_pct || 0))
            }
          }
          const oldRate = Number(aff.commission_pct || 0)
          if (Math.abs(newRate - oldRate) > 0.001) {
            const { error: upErr } = await supabaseAdmin
              .from('affiliates')
              .update({ commission_pct: newRate, updated_at: new Date().toISOString() })
              .eq('id', aff.id)
            if (upErr) throw upErr
            log.tier_changes.push({ affiliate: aff.code, from: oldRate, to: newRate, volume })
          }
        }

        // Override payout — fires for each recruit with volume > 0
        if (aff.parent_affiliate_id && volume > 0) {
          const recruiter = affById.get(aff.parent_affiliate_id)
          const overridePct = Number(recruiter?.recruiter_override_pct || 0)
          if (overridePct > 0) {
            const overrideAmount = Math.round((volume * overridePct) / 100 * 100) / 100
            const { error: ovErr } = await supabaseAdmin
              .from('affiliate_payouts')
              .insert({
                affiliate_id: aff.parent_affiliate_id,
                payout_type: 'override',
                period,
                amount: overrideAmount,
                trigger_affiliate_id: aff.id,
                notes: `Override: ${overridePct}% of ${aff.code} volume $${volume.toFixed(2)} in ${period}`,
              })
            if (ovErr && ovErr.code !== '23505') throw ovErr  // 23505 = unique violation = already paid (idempotent)
            if (!ovErr) log.overrides_inserted += 1
          }
        }
      } catch (perAffErr) {
        log.errors.push({ affiliate: aff.code, error: perAffErr.message })
      }
    }

    // 3. Royalty payouts — flat-rate affiliates
    const flatRateAffs = (affiliates || []).filter((a) => a.is_flat_rate)
    if (flatRateAffs.length > 0) {
      const oppGross = await sumGrossRevenue(period)
      const royaltyAmount = Math.round((oppGross * ROYALTY_PCT) / 100 * 100) / 100

      for (const aff of flatRateAffs) {
        try {
          const { error: royErr } = await supabaseAdmin
            .from('affiliate_payouts')
            .insert({
              affiliate_id: aff.id,
              payout_type: 'royalty',
              period,
              amount: royaltyAmount,
              trigger_affiliate_id: null,
              notes: `Royalty: ${ROYALTY_PCT}% of OPP gross revenue $${oppGross.toFixed(2)} for ${period}`,
            })
          if (royErr && royErr.code !== '23505') throw royErr
          if (!royErr) log.royalties_inserted += 1
        } catch (perAffErr) {
          log.errors.push({ affiliate: aff.code, royalty_error: perAffErr.message })
        }
      }
    }

    log.finished_at = new Date().toISOString()
    return res.status(200).json(log)
  } catch (err) {
    console.error('affiliate-monthly cron error:', err)
    log.errors.push({ fatal: err.message })
    log.finished_at = new Date().toISOString()
    return res.status(500).json(log)
  }
}
