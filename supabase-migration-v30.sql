-- v30: store the gateway (NoRamp) checkout session id on the order.
-- Lets a missed/late payment callback be reconciled by polling the gateway
-- (POST /checkout/sessions/{id}/reconcile) from the success-return + the
-- expire-awaiting-payment cron, so a paid order can't be stranded as
-- "awaiting payment" or wrongly abandoned. Idempotent.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS card_session_id text;
