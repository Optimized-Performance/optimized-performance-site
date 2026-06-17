-- Multi-account PayPal routing — adds the column that records which PayPal
-- account each order routes to (lib/payments/paypalAccounts.js).
--
-- null = OPP (the legacy/default account), so existing rows need no backfill
-- and resolvePaypalAccount(null) returns OPP. create.js writes the resolved
-- key ('opp' | 'ethan' | ...) for new PayPal orders; capture + the webhook read
-- it back so they use the matching account's credentials.
--
-- SAFE TO RUN ANYTIME: the code resolves a missing/null value to OPP, so the
-- single-account flow is unaffected until accounts are weighted in env. Run
-- BEFORE setting any non-OPP PAYPAL_WEIGHT_* so routed orders can persist their
-- account.
--
-- Run in the Supabase SQL editor (Primary Database, role postgres).

alter table public.orders add column if not exists paypal_account text;
