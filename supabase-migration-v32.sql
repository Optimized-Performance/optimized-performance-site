-- v32: per-account VIP discount
--
-- A permanent discount tied to a customer's account (not a shareable code). It
-- applies at checkout only when the customer is logged into their verified
-- account (order-create reads the customer session), so it can't be given out.
-- 0 = no discount (default). Value is a percentage (e.g. 15 = 15% off).
--
-- Idempotent. Safe to re-run.

alter table customers add column if not exists discount_pct numeric default 0;
