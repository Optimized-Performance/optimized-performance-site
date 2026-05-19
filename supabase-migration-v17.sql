-- =========================================
-- Migration v17: payment_status taxonomy expansion
-- Paste into Supabase → SQL Editor → New query → Run
-- Idempotent — safe to re-run.
-- =========================================
--
-- Before v17: payment_status was effectively binary — every order entered as
-- 'pending' regardless of rail, and webhooks (or admin Mark Paid clicks)
-- flipped to 'completed'. That conflated two very different states:
--   (a) "instant rail, no capture webhook yet" (PayPal/card/crypto)
--   (b) "manual rail, awaiting human verification" (Zelle/Venmo)
-- The admin Pending view collected dead carts from (a) and drowned the
-- legitimate verification queue in (b).
--
-- v17 splits them:
--
--   'awaiting_payment' — instant rail, no capture yet. Webhook will flip
--                        to 'completed' on capture, or the 48h cron will
--                        flip to 'abandoned'. NOT shown in the Pending view.
--   'pending'          — reserved for manual verification: Zelle/Venmo
--                        awaiting bank-deposit confirmation, OR any rail
--                        with fraud_status='blocked'. This is the admin's
--                        real verification queue.
--   'completed'        — unchanged.
--   'refunded'         — unchanged.
--   'abandoned'        — new terminal state for awaiting_payment orders
--                        older than 48h with no webhook activity. Kept for
--                        cart-abandonment analytics + fraud forensics.
--
-- payment_status is a free-text column with no CHECK constraint, so no
-- schema change is required — this migration only adds a partial index for
-- the 48h sweep cron and documents the new values via COMMENT.

-- Partial index for the abandoned-payment cron. The hot query is
--   SELECT id FROM orders
--   WHERE payment_status = 'awaiting_payment' AND created_at < now() - '48h'
-- Partial keeps the index tiny — only in-flight awaiting_payment rows are
-- indexed, not the entire orders table.
CREATE INDEX IF NOT EXISTS idx_orders_awaiting_payment_created_at
  ON orders (created_at)
  WHERE payment_status = 'awaiting_payment';

COMMENT ON COLUMN orders.payment_status IS
  'awaiting_payment | pending | completed | refunded | abandoned. awaiting_payment = instant rail (paypal/card/crypto) not yet captured. pending = manual verification queue (zelle/venmo or fraud_status=blocked). abandoned = awaiting_payment that timed out after 48h (cron-driven).';

NOTIFY pgrst, 'reload schema';
