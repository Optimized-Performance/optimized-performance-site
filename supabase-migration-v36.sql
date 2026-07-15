-- Migration v36 — customer-selected shipping tier (2026-07-14)
--
-- orders.shipping_method: which speed tier the customer chose — 'ground' |
-- 'twoday' | 'overnight' (US) or 'canada' (flat intl). NULL on pre-tier orders,
-- which the app treats as 'twoday' (the default). Drives both the shipping
-- charge (lib/shipping) and the Shippo label service (lib/shippo) so the label
-- matches what the customer paid for.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_method text;

COMMENT ON COLUMN orders.shipping_method IS 'Chosen shipping speed tier (ground/twoday/overnight/canada); NULL = pre-v36 → treated as twoday. v36.';
