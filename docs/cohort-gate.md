# Referral session — affiliate attribution (+ legacy referral unlock)

> **Status 2026-07-23:** the referral gate is RETIRED as an access mechanism.
> Site access is a **login wall** (`components/AgeGate.js` — attestation +
> sign-in/researcher-application at entry), catalog visibility is
> **account-tiered** (`lib/catalog.getVisibleCatalog`: `public` /
> `account_gated`, keyed to the approved-researcher allowlist), and member
> merchandising keys off the **customer session** (`lib/cohort-ui` reads the
> `opp_customer_present` marker). There are zero `cohort`-tier SKUs in the
> live catalog. This is the standard members-area pattern — the same shape as
> GymThingz — with no cookie-conditional content variation for unauthenticated
> traffic beyond "signed out sees the plain public storefront."
>
> What this module still does in production:
>
> 1. **Affiliate attribution** — `?ref=CODE` validates against the
>    `affiliates` table and sets the `opp_ref` cookie so checkout pays
>    commission to the right code. This is the load-bearing function and must
>    survive any future cleanup (the 8/1 monthly affiliate cron depends on
>    attribution being correct).
> 2. **Legacy referral-unlock cookie** (`opp_cohort` / `opp_cohort_ui`) —
>    still issued and back-filled for any signed-in customer, but nothing
>    user-facing keys off it anymore (visibility = account tiers,
>    merchandising = account marker, /resources = account session).
>
> Full teardown of the unlock half (delete `?cohort=` tokens, recovery-unlock
> plumbing, `opp_cohort_ui`, and rename `useCohortUi`) is scheduled **after
> the 8/1 affiliate cron** — see TASKS.md in the sandbox root.

## How attribution works (current)

1. Visitor lands on any `getServerSideProps` page with `?ref=CODE`.
2. `lib/cohort-session.getCohortFromRequest(context, supabaseAdmin)` runs
   `applyAffiliateRef`: validates the code against the `affiliates` table
   (active codes only, single DB roundtrip) and sets the `opp_ref`
   attribution cookie on the response.
3. At checkout, the order carries the attributed code; the monthly affiliate
   cron pays commission on attributed orders.

Attribution is deliberately independent of any visibility/env switch — it
works identically in every catalog posture.

## Historical notes

The pre-wall design (referral-token catalog visibility, `?cohort=` allowlist
tokens, `NEXT_PUBLIC_HIDE_RESTRICTED` / `NEXT_PUBLIC_RESTRICTED_FORCE_SHOW`
modes, and the associated smoke tests) is preserved in git history for this
file (pre-2026-07-23) and in `business-context/COHORT-GATE-CONTEXT.md`
(2026-05-05). Those switches still exist in `data/catalog-client.js`
(`shouldShowRestricted`) and now modulate the account-driven `restricted`
check the same way they modulated the referral check.

## Known limitations that still apply

1. **iOS Safari ITP** may evict cookies after ~7 days of inactivity; a
   returning affiliate-referred customer may need to re-click the link for
   attribution (their ACCESS is unaffected — that's their login).
2. **API surface:** only HTML rendering is tiered. `/api/orders/create`
   enforces purchase approval (`gated_emails` allowlist) — the real
   enforcement layer — but does not consult referral state.
