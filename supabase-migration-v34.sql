-- Migration v34 — Canada shipping (2026-07-11)
--
-- orders.country: ISO-3166 alpha-2 destination ('US' | 'CA'); existing rows
-- backfill implicitly as US via the default.
--
-- orders.customs_ack: the customer's explicit checkout acknowledgment for
-- international orders — they agreed to the $50 flat international shipping
-- fee and WAIVED any right to a refund/replacement for packages delayed,
-- held, or seized by customs. Enforced server-side in /api/orders/create
-- (a CA order without the ack is rejected 400). Stored per-order as the
-- audit trail / chargeback evidence.
--
-- Run BEFORE deploying the Canada checkout code.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'US';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customs_ack boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN orders.country IS 'Shipping destination country (ISO alpha-2). v34.';
COMMENT ON COLUMN orders.customs_ack IS 'Customer acknowledged the $50 intl fee + waived refunds for customs seizure (v34). Server-enforced for CA orders.';
