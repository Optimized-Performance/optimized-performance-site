-- Migration v23: payment-recovery nudge support.
--
-- Two additive columns on orders, both idempotent:
--   nudge_sent_at     — set when the 1-hour payment-recovery email fires for a
--                       stuck awaiting_payment order, so the cron only ever
--                       nudges a given order once (same idempotency pattern as
--                       delivery_followup_sent_at).
--   recovery_discount — dollar value of the extra 5% recovery incentive applied
--                       when a customer completes via a recovery link (?recover
--                       token). Audit/attribution only — `total` already nets it
--                       out. Mirrors the memorial_day_discount column pattern.
--
-- Safe to re-run.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS nudge_sent_at    timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS recovery_discount numeric DEFAULT 0;

-- Partial index for the hourly recovery cron's hot query: stuck instant-rail
-- orders that haven't been nudged yet. Keeps the scan cheap as abandoned rows
-- accumulate.
CREATE INDEX IF NOT EXISTS idx_orders_awaiting_unnudged
  ON orders (created_at)
  WHERE payment_status = 'awaiting_payment' AND nudge_sent_at IS NULL;
