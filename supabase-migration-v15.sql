-- =========================================
-- Migration v15: payment_method column on orders
-- Paste into Supabase → SQL Editor → New query → Run
-- Idempotent — safe to re-run.
-- =========================================
--
-- Adds payment_method to orders so admin can filter by method (cleanly
-- isolates the "Awaiting Zelle" queue from card/crypto pending orders)
-- and so future analytics can break revenue down by rail. Existing rows
-- get NULL — that's fine, they were all card/crypto before Zelle existed
-- and the admin tab treats NULL as a no-filter match.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method text;

COMMENT ON COLUMN orders.payment_method IS
  'Payment rail the customer chose at checkout. One of: ''card'' (Bankful HPP), ''crypto'' (NOWPayments), ''zelle'' (manual bank-to-bank). NULL on legacy rows pre-v15. Drives the admin Orders tab filter and is the signal for the "Awaiting Zelle" queue.';

-- Lightweight index for the admin "Awaiting Zelle" filter — payment_method
-- = 'zelle' AND payment_status = 'pending' is the hot query.
CREATE INDEX IF NOT EXISTS idx_orders_payment_method_status
  ON orders (payment_method, payment_status);

NOTIFY pgrst, 'reload schema';
