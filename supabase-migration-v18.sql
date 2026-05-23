-- Migration v18 — Memorial Day 2026 sale tracking
--
-- Adds `memorial_day_discount` column to orders for audit-trail visibility of
-- the site-wide auto-applied 15% Memorial Day weekend discount. Separate from
-- the existing `discount` column which records affiliate-code discount only.
--
-- Run before deploying the Memorial Day sale code change — the
-- /api/orders/create insert will fail silently (caught) and orders will
-- still create, but the discount audit trail won't populate until this
-- column exists.
--
-- Safe to re-run; uses IF NOT EXISTS.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS memorial_day_discount NUMERIC(10, 2) DEFAULT 0;

COMMENT ON COLUMN orders.memorial_day_discount IS
  'Memorial Day 2026 weekend sale discount applied to this order. Site-wide auto-applied 15% off, stacks multiplicatively with affiliate discount. Populated by /api/orders/create when the sale window is active (2026-05-23 to 2026-05-25 inclusive).';
