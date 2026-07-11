# Affiliate Program — Implementation Spec

**Status:** Schema migration v5 lands the structural pieces. Monthly cron + admin UI + affiliate-facing dashboard ship in subsequent commits.

**Effective:** July 2026 onboarding (primary affiliate consolidation). Tier structure applies to all affiliates from launch (May 19) onward.

---

## Commission basis (updated 2026-07-10)

Every affiliate dollar (direct commission, recruiter override, royalty) is computed on the **commissionable basis** defined in `lib/commission`: the post-all-discount order total **minus shipping minus the order's COGS snapshot** (per Tris — commission accounts for cost of goods).

- `orders.cogs` (migration v33) is the estimated vendor cost of the order's items, stamped at order-create time from the `PRODUCT_COST` map in `lib/takehome-config` (unmapped SKUs fall back to 10% of line revenue).
- Orders created **before** the v33 cutover have `cogs` NULL → their basis stays the legacy total-minus-shipping. Nothing already shown or paid shifts retroactively.
- Volume/"revenue" **stats** still report gross sales; only earnings use the basis. Tier quotas below are measured on the commissionable basis (as they were pre-v33, which already excluded shipping).

## Tier structure

### Standard affiliates (no recruiter)

Tiered commission rate based on **prior-month attributed volume**. Tiers are evaluated monthly by `/api/cron/affiliate-monthly` under the **two-consecutive-month rule** (2026-07-10):

- **Promotion** requires volume above the current rate's tier for **two months in a row** — the rate moves to the highest tier both months support.
- **Demotion** requires volume below the current rate's tier for **two months in a row** — the rate moves to the best tier either of the two months earned.
- A mixed read (one qualifying month, one not) **holds** the current rate.
- Affiliates enrolled within the two-month window are never demoted off a partial history (two qualifying months can still promote them).

Decision logic lives in `lib/affiliate-config` (`decideTier`), shared with the dashboard so displayed tiers can't drift from paid ones.

| Prior month attributed volume | Commission rate |
|---|---|
| $0 – $9,999 | 10% |
| $10,000 – $19,999 | 15% |
| $20,000 – $34,999 | 20% |
| $35,000 – $59,999 | 25% |
| $60,000+ | 30% |

Customer discount on standard affiliates: **10%** (default; configurable per affiliate).

### Recruited affiliates (mentees + any affiliate signed by a recruiter)

Same volume thresholds, but each tier rate is **reduced by the recruiter's `recruiter_override_pct`** (currently 5 for Tris). The differential flows to the recruiter as a recruitment override (see "Monthly payouts" below).

For Tris-recruited affiliates (`recruiter_override_pct = 5`):

| Prior month attributed volume | Commission rate (recruited) | Override to recruiter |
|---|---|---|
| $0 – $9,999 | 5% | 5% |
| $10,000 – $19,999 | 10% | 5% |
| $20,000 – $34,999 | 15% | 5% |
| $35,000 – $59,999 | 20% | 5% |
| $60,000+ | 25% | 5% |

Total commission paid by OPP per recruited-affiliate dollar = standard tier rate (unchanged).

### Primary-tier affiliates (e.g., Tris)

Flat rate, no tier ratchet. Created with `is_flat_rate = true` so the monthly cron job skips their tier recalculation.

- Commission rate: **37%** on volume from their own affiliate code (or whatever is configured at affiliate creation)
- Recruiter override: **`recruiter_override_pct` = 5** (paid out monthly on volume from any affiliate they recruit)
- Customer discount: per affiliate (Tris's specific terms TBD)

### Seeded starting tier (proven-volume signups)

A new affiliate who comes in with documented sales history from another vendor (anonymized merchant statements, affiliate dashboard screenshots, or other admissible proof) can be **seeded at the tier their proven volume warrants** instead of starting at Tier 1. Admin sets the appropriate `commission_pct` on the affiliate record at creation time.

- The cron continues to run normally on this affiliate from month 1 — if their actual attributed volume continues to qualify, they stay at the seeded tier; if they underdeliver **two months in a row**, the cron ratchets them down (a single soft month holds the seed, and an affiliate enrolled within the two-month window is never demoted).
- Self-correcting: no floor field, no manual locking. The seed is just initial placement.
- Applies equally to direct signups and recruited signups — recruited proven-volume affiliates are seeded at the recruited-tier rate corresponding to their proven volume (i.e., 5 points below the standard tier their volume would qualify for).
- Documentation of the seed reasoning should be retained in the affiliate's notes field for audit trail.

Use cases:
- Affiliate brings $50K+/month from another vendor → seed at Tier 5 (25% recruited / 30% direct) instead of waiting through 4 months of ratchet.
- Tris's recruits coming in with their own established books → seed at the appropriate recruited tier on day 1.
- Reduces friction in winning over established affiliates from competitors.

### Sub-affiliate hierarchy

Strictly **2 levels** — primary affiliate → direct recruits. Recruits cannot have their own sub-recruits.

When a recruit is signed up:
- Their `affiliates.parent_affiliate_id` is set to the recruiter's `id`
- They're created with `is_flat_rate = false` (default)
- Their `commission_pct` starts at `(Tier 1 rate − recruiter.recruiter_override_pct)` and ratchets up monthly

**Recruited-affiliate commission flows entirely to the recruit.** The recruiter receives the override separately as a monthly payout (computed from prior-month attributed volume × `recruiter_override_pct`), not via order-time deduction.

---

## Monthly payouts (paid via `affiliate_payouts` table)

### Recruitment override

When any affiliate with a non-null `parent_affiliate_id` has prior-month attributed volume > 0, the recruiter receives an override payout of `attributed_volume × recruiter.recruiter_override_pct / 100`.

- Recorded as `payout_type='override'`, with the recruit's id stored in `trigger_affiliate_id`
- Per recruit per period — same recruit generates a separate payout for each period they have volume
- UNIQUE constraint on `(affiliate_id, payout_type, period, trigger_affiliate_id)` prevents duplicate inserts on cron retries
- **Replaces** the prior $1K mentee milestone bonus (cleaner structure, scales with actual recruit volume)

### Royalty (primary-tier affiliate only)

The primary affiliate receives **5% of OPP's total gross monthly revenue** — all sources, all orders, regardless of whether they were attributed to any affiliate.

- Recorded as `payout_type='royalty'`, with `trigger_affiliate_id = NULL`
- Per period — UNIQUE constraint prevents duplicate inserts on cron retries
- Calculation: sum of the commissionable basis (total − shipping − cogs, see `lib/commission`) over the period's completed orders × 0.05
- **Stacks** with the recruitment override on recruit volume — so on a recruit's $50K month, the primary collects 5% override + 5% royalty contribution from that revenue, intentional per deal terms

---

## Per-order commission flow (unchanged)

When an order is created with an `affiliate_code`:
1. Look up the affiliate by `code`
2. Persist `affiliate_code` and the affiliate's current `commission_pct` on the order
3. On payment confirmation (webhook), update affiliate aggregates: `total_sales += 1`, `total_revenue += order.total`, `total_commission += commission`

**No commission-override math at order time** for recruits — the recruit's `commission_pct` already reflects the post-override rate (set when their `parent_affiliate_id` is assigned, ratcheted monthly thereafter). The recruiter's override is computed and paid in the monthly cron, not per-order. Royalty likewise.

---

## Monthly cron job — `/api/cron/affiliate-monthly`

**Trigger:** Vercel Cron, run on the 1st of each month at 09:00 UTC. Manual trigger via authenticated POST for testing.

**Pseudocode** (volume sums use the commissionable basis: total − shipping − cogs):
```
period = previous_calendar_month  // e.g., '2026-06' if running on July 1
prev_period = period - 1          // e.g., '2026-05' — the two-month ratchet read
opp_gross = SUM(commissionable basis) over period's completed orders

FOR each affiliate WHERE active = true:
  attributed_volume = SUM(commissionable basis) over period's completed orders with affiliate_code = affiliate.code

  // 1. Tier ratchet (skip if flat-rate or secondary code) — two-consecutive-month rule
  IF NOT affiliate.is_flat_rate AND affiliate.owner_affiliate_id IS NULL:
    prev_volume = same sum over prev_period
    override = recruited ? recruiter.recruiter_override_pct : 0
    current_tier = affiliate.commission_pct + override   // stored pct is net of override
    target_tier = decideTier(current_tier, tierLookup(prev_volume), tierLookup(attributed_volume))
      // promote: BOTH months above current → highest tier both support
      // demote:  BOTH months below current → best tier either month earned
      // mixed:   hold
    IF demotion AND affiliate.created_at inside the two-month window: hold  // no partial-history demotions
    new_commission_pct = max(0, target_tier - override)

    IF new_commission_pct != affiliate.commission_pct:
      UPDATE affiliates SET commission_pct = new_commission_pct WHERE id = affiliate.id
      // Note: takes effect on orders going forward; doesn't backfill prior orders

  // 2. Recruitment override (recruits with volume → recruiter gets override)
  IF affiliate.parent_affiliate_id IS NOT NULL AND attributed_volume > 0:
    recruiter = SELECT * FROM affiliates WHERE id = affiliate.parent_affiliate_id
    override_amount = attributed_volume * recruiter.recruiter_override_pct / 100
    INSERT INTO affiliate_payouts (
      affiliate_id = affiliate.parent_affiliate_id,
      payout_type = 'override',
      period = period,
      amount = override_amount,
      trigger_affiliate_id = affiliate.id,
      notes = 'Override: {recruiter.recruiter_override_pct}% of {affiliate.code} volume ${attributed_volume} in {period}'
    ) ON CONFLICT DO NOTHING

// 3. Royalty for primary-tier affiliates
FOR each affiliate WHERE is_flat_rate = true AND active = true:
  // For now there's just one (Tris). If multiple flat-rate affiliates ever exist, the royalty rate per affiliate would need to be configurable on the affiliate record.
  royalty_amount = opp_gross * 0.05
  INSERT INTO affiliate_payouts (
    affiliate_id = affiliate.id,
    payout_type = 'royalty',
    period = period,
    amount = royalty_amount,
    trigger_affiliate_id = NULL,
    notes = 'Royalty: 5% of OPP gross revenue ${opp_gross} for {period}'
  ) ON CONFLICT DO NOTHING
```

**Idempotency:** the UNIQUE constraint on `(affiliate_id, payout_type, period, trigger_affiliate_id)` means re-running the cron for the same period is safe — duplicates are rejected.

---

## Admin UI extensions

### `/admin` → Affiliates tab — additions needed

- **Hierarchy column:** show parent affiliate's name/code (or "primary" if `parent_affiliate_id IS NULL`)
- **Tier display:** show current `commission_pct` + `is_flat_rate` indicator + `recruiter_override_pct` (when > 0)
- **Payouts tab:** new sub-tab listing pending `affiliate_payouts` entries (paid_at IS NULL), with a "Mark paid" action that sets `paid_at = now()`. Filter by `payout_type` (override / royalty / manual).
- **Manual payout entry form:** for one-off bonuses or corrections (`payout_type='manual'`)

### Reporting

- Monthly summary: total commissions paid (per-order), total bonuses + royalties paid, total OPP revenue
- Per-affiliate ledger: scrollable history of orders attributed + payouts received

---

## Affiliate-facing dashboard

Public-facing site at `/affiliate/login` (separate from admin). v1 scope:

- Login (email + magic link or simple password — discuss with Matt)
- Dashboard:
  - Current tier / commission rate
  - Month-to-date attributed volume + projected commission
  - Last-month volume + commission earned
  - Pending payouts (bonuses, royalties)
  - Affiliate code + share link (`https://optimizedperformancepeptides.com/?ref=CODE`)
- Network view (for affiliates with `recruiter_override_pct > 0`): list of recruits with their MTD volume + tier + projected override earned this month + override paid last month
- Payout history (last 12 months) — separate columns for direct commission, recruitment override, royalty

---

## Open implementation questions for next session

1. **Auth mechanism for affiliate dashboard** — magic link (Supabase Auth) vs. simple email+password vs. Telegram-only. Magic link is least friction.
2. **Tier recalculation timing** — strict prior-month-completed? Or rolling 30-day? (Current spec: prior-month-completed, simpler.)
3. **Customer discount on primary-tier** — Tris's specific discount % to give customers. Not yet decided. Default 10% if unspecified.
4. **Payout disbursement** — manual bank transfer? Wise? Modern Treasury / ACH automation? v1 can be manual ("mark paid" in admin); automate when volume justifies.
5. **1099 reporting** — at year-end, generate 1099-NEC (commissions, royalties) per US-domiciled affiliate. Out of scope for v1 dashboard but flag for accounting.

---

## Migration application order

1. Run `supabase-migration-v5.sql` in Supabase SQL Editor
2. Verify `affiliates.parent_affiliate_id`, `affiliates.is_flat_rate`, and `affiliates.recruiter_override_pct` exist
3. Verify `affiliate_payouts` table exists with correct UNIQUE constraint
4. Backfill data: set `is_flat_rate=true`, `commission_pct=37`, `recruiter_override_pct=5` on Tris's row once he signs and is seeded
