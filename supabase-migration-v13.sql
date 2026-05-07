-- =========================================
-- Migration v13: Refund tracking on orders
-- Paste into Supabase → SQL Editor → New query → Run
-- Idempotent — safe to re-run.
-- =========================================
--
-- Adds refund metadata columns so the admin Refund & Cancel button can
-- record who refunded what, when, and why — separately from the
-- fulfillment_status='cancelled' soft-delete that already existed.
--
-- The refund flow (admin Orders tab → Refund & Cancel) writes:
--   - payment_status: 'refunded'
--   - fulfillment_status: 'cancelled'
--   - refunded_at, refund_amount, refund_reason, refunded_by
--
-- v1 does NOT yet call the Bankful refund API automatically — admin
-- processes the refund through Bankful's dashboard separately and the
-- button records the OPP-side bookkeeping. v1.1 will add the API call
-- once Diana confirms the Bankful refund endpoint.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_amount numeric(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_reason text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_by text;

COMMENT ON COLUMN orders.refunded_at IS
  'Timestamp the refund was recorded by admin via Refund & Cancel button. NULL until refund is processed.';
COMMENT ON COLUMN orders.refund_amount IS
  'USD refunded. Defaults to order.total at refund time but admin can override for partial refunds.';
COMMENT ON COLUMN orders.refund_reason IS
  'Free-text reason captured at refund time for audit + chargeback defense.';
COMMENT ON COLUMN orders.refunded_by IS
  'Admin identifier (email or "admin" for the single-password setup) who triggered the refund.';

NOTIFY pgrst, 'reload schema';
