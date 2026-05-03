-- =========================================
-- Migration v7: Shipment tracking timestamps for chargeback-prevention emails
-- Paste into Supabase → SQL Editor → New query → Run
-- Idempotent — safe to re-run.
-- =========================================
--
-- Adds three timestamp columns on orders:
--
--   1. shipped_at — set when fulfillment_status first transitions to 'shipped'.
--      Drives the 7-day delivery follow-up cron and lifecycle reporting.
--
--   2. shipment_notified_at — set when /api/admin/orders sends the customer
--      ship-confirmation email via SendGrid. Used to make the trigger idempotent
--      (re-saving the order after it's marked shipped won't re-send the email).
--
--   3. delivery_followup_sent_at — set when /api/cron/delivery-followup sends
--      the 7-day check-in email. Used to ensure each order gets at most one
--      follow-up regardless of how many times the cron fires.
--
-- See lib/alerts.js for the email payloads (sendShipmentNotification + sendDeliveryFollowup).

ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipped_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_notified_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_followup_sent_at timestamptz;

COMMENT ON COLUMN orders.shipped_at IS
  'Timestamp when this order''s fulfillment_status first transitioned to ''shipped''. Set by /api/admin/orders PATCH. Drives the delivery-followup cron 7-day window.';

COMMENT ON COLUMN orders.shipment_notified_at IS
  'Timestamp when the customer ship-confirmation email was sent. NULL = not yet notified. Used by /api/admin/orders PATCH to suppress duplicate sends if the row is re-saved.';

COMMENT ON COLUMN orders.delivery_followup_sent_at IS
  'Timestamp when the 7-day delivery-followup email was sent by /api/cron/delivery-followup. NULL = not yet sent. The cron filters on shipped_at < now() - 7 days AND delivery_followup_sent_at IS NULL.';

-- Index for fast cron lookup of orders ready for follow-up
CREATE INDEX IF NOT EXISTS idx_orders_shipped_followup
  ON orders(shipped_at)
  WHERE shipped_at IS NOT NULL AND delivery_followup_sent_at IS NULL;

NOTIFY pgrst, 'reload schema';
