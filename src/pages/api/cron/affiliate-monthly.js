import { supabaseAdmin } from '../../../lib/supabase'
import { commissionableTotal } from '../../../lib/commission'
import { ROYALTY_PCT, tierLookup, decideTier } from '../../../lib/affiliate-config'
import { isAuthorizedCron } from '../../../lib/cron-auth'

// Monthly affiliate processing job.
// Runs on the 1st of each month at 09:00 UTC via Vercel Cron (vercel.json).
// Manual trigger: POST with header x-cron-secret: $CRON_SECRET.
//
// Steps (per docs/affiliate-program-spec.md):
//   1. Tier ratchet for non-flat-rate affiliates — TWO-CONSECUTIVE-MONTH rule
//      (2026-07 review): a promotion or demotion requires two months in a row
//      of qualifying attributed volume; one hot or cold month holds the rate.
//      Adjusted by recruiter_override_pct if recruited. See
//      lib/affiliate-config decideTier for the exact decision table.
//   2. Recruitment override payouts — for each recruit with prior-month volume > 0.
//   3. Royalty payouts — for each is_flat_rate affiliate (5% of OPP gross).
//
// Idempotent: UNIQUE (affiliate_id, payout_type, period, trigger_affiliate_id) on
// affiliate_payouts means re-running for the same period is safe.
//
// Tier table + tierLookup + decideTier live in lib/affiliate-config (shared
// with the affiliate dashboard so displayed tiers can't drift from paid ones).

function previousPeriodKey(d = new Date()) {
  const prev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`
}

// The period immediately before a YYYY-MM key (for the two-month ratchet read).
function periodKeyBefore(pk) {
  const [y, m] = pk.split('-').map(Number)
  const prev = new Date(Date.UTC(y, m - 2, 1))
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
    .select('total, shipping, cogs')
    .eq('affiliate_code', code)
    .eq('payment_status', 'completed')
    .gte('created_at', start)
    .lt('created_at', end)
  if (error) throw error
  // Override payout basis: product margin — shipping + COGS snapshot excluded
  // (see lib/commission; pre-v33 orders have cogs NULL → legacy basis).
  return (data || []).reduce((s, o) => s + commissionableTotal(o), 0)
}

async function sumGrossRevenue(pk) {
  const { start, end } = periodRange(pk)
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('total, shipping, cogs')
    .eq('payment_status', 'completed')
    .gte('created_at', start)
    .lt('created_at', end)
  if (error) throw error
  // Royalty payout basis: same commissionable basis as everything else.
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
    // Include owner_affiliate_id (v28) so secondary codes can be skipped by the
    // tier ratchet. Fall back to the pre-v28 column set if the migration hasn't
    // run yet, so the cron never hard-fails on a missing column.
    let affiliates, affErr
    ;({ data: affiliates, error: affErr } = await supabaseAdmin
      .from('affiliates')
      .select('id, code, name, commission_pct, is_flat_rate, parent_affiliate_id, recruiter_override_pct, owner_affiliate_id, active, created_at')
      .eq('active', true))
    if (affErr && /owner_affiliate_id/.test(affErr.message || '')) {
      ;({ data: affiliates, error: affErr } = await supabaseAdmin
        .from('affiliates')
        .select('id, code, name, commission_pct, is_flat_rate, parent_affiliate_id, recruiter_override_pct, active, created_at')
        .eq('active', true))
    }
    if (affErr) throw affErr

    const affById = new Map((affiliates || []).map((a) => [a.id, a]))

    // Earlier of the two ratchet months (the month before `period`), for the
    // two-consecutive-month rule + the young-affiliate demotion guard.
    const prevPeriod = periodKeyBefore(period)
    const twoMonthStart = new Date(periodRange(prevPeriod).start)

    // 1. Tier ratchet + 2. Override payouts (in same loop)
    for (const aff of affiliates || []) {
      try {
        const volume = await sumOrders(aff.code, period)

        // Tier ratchet (skip flat-rate AND secondary codes). A secondary code
        // (owner_affiliate_id set) carries a deliberately-set split for the
        // same person's sub-channel — auto-ratcheting would silently overwrite
        // the rate Matt configured for it.
        //
        // Two-consecutive-month rule (2026-07 review): promotion or demotion
        // requires BOTH of the last two months to qualify — see decideTier in
        // lib/affiliate-config. Comparison happens on the TIER plane: a
        // recruited affiliate's stored pct is (tier − recruiter override), so
        // the override is added back before deciding and re-subtracted after.
        if (!aff.is_flat_rate && !aff.owner_affiliate_id) {
          const prevVolume = await sumOrders(aff.code, prevPeriod)
          const recruiter = aff.parent_affiliate_id ? affById.get(aff.parent_affiliate_id) : null
          const override = Number(recruiter?.recruiter_override_pct || 0)
          const currentTier = Number(aff.commission_pct || 0) + override
          let targetTier = decideTier({
            current: currentTier,
            earnedPrev: tierLookup(prevVolume),
            earnedLast: tierLookup(volume),
          })
          // Young affiliates (enrolled inside the two-month window) don't have
          // a fair two-month read — never demote them off a partial history.
          // (Seeded starting tiers stay honored until two full months say
          // otherwise.) Two qualifying months still promote.
          if (targetTier < currentTier && aff.created_at && new Date(aff.created_at) > twoMonthStart) {
            targetTier = currentTier
          }
          const newRate = Math.max(0, targetTier - override)
          const oldRate = Number(aff.commission_pct || 0)
          if (Math.abs(newRate - oldRate) > 0.001) {
            const { error: upErr } = await supabaseAdmin
              .from('affiliates')
              .update({ commission_pct: newRate, updated_at: new Date().toISOString() })
              .eq('id', aff.id)
            if (upErr) throw upErr
            log.tier_changes.push({ affiliate: aff.code, from: oldRate, to: newRate, volume, prev_volume: prevVolume })
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

    // 3. Royalty payouts — the 5% royalty is a bespoke Tris-only term (5/04
    // letter), NOT a benefit of being flat-rate. `is_flat_rate` is ALSO set on
    // Tris's recruits (so the tier ratchet can't claw back their rate) and on
    // secondary codes — so filtering on is_flat_rate ALONE paid a 5%-of-gross
    // royalty to every recruit + secondary code (bug, found 2026-07-03).
    // Restrict to a TOP-LEVEL flat-rate affiliate: flat-rate AND no recruiter
    // parent AND not a secondary code → uniquely Tris's primary code.
    const flatRateAffs = (affiliates || []).filter(
      (a) => a.is_flat_rate && !a.parent_affiliate_id && !a.owner_affiliate_id
    )
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
