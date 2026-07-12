-- Migration v35 — Shippo label purchase (2026-07-12)
--
-- label_url:  the purchased label PDF (4x6) so the admin can (re)print from
--             the Orders tab. label_cost: what the label actually cost —
--             real postage spend per order for the take-home model later.
--
-- Soft-degrading: the shippo-label API stamps tracking alone if these
-- columns are missing, so deploy order doesn't matter. Run it anyway.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS label_url text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS label_cost numeric(10,2);

COMMENT ON COLUMN orders.label_url IS 'Shippo label PDF url (v35).';
COMMENT ON COLUMN orders.label_cost IS 'Actual postage paid for the label (v35).';
