-- Migration v33 — per-order COGS snapshot for the affiliate commission basis
-- (2026-07-10, per Tris's instruction from the Syngyn review)
--
-- Affiliate earnings now account for cost of goods: lib/commission computes
-- every payout dollar on (total - shipping - cogs). cogs is the estimated
-- vendor cost of the order's items, stamped at order-create time from the
-- PRODUCT_COST map in lib/takehome-config (the same per-SKU vendor costs the
-- Analytics take-home panel uses).
--
-- NULLABLE ON PURPOSE — no default, no backfill. Orders created before the
-- cutover keep cogs NULL, which the basis treats as 0, so historical earnings,
-- dashboards, and already-paid payouts do not shift retroactively. Only orders
-- created after this deploy carry the new basis.
--
-- RUN THIS BEFORE DEPLOYING the code that references orders.cogs: the
-- affiliate dashboard / payout / cron SELECTs name the column and fail if it
-- is missing. Checkout itself degrades gracefully (create retries without the
-- snapshot), but don't lean on that.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS cogs numeric(10,2);

COMMENT ON COLUMN orders.cogs IS 'Estimated vendor cost of items at order-create time (v33). NULL = pre-cutover order, commission basis excludes COGS.';
