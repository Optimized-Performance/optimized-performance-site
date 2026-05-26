-- =========================================
-- Migration v19: product_notify_requests
-- Paste into Supabase → SQL Editor → New query → Run
-- Idempotent — safe to re-run.
-- =========================================
--
-- Per-product "Notify me when it ships" capture for preorder / coming-soon
-- SKUs (MOTS-C today; tadalafil / sildenafil and any future drops). Kept
-- SEPARATE from newsletter_subscribers on purpose:
--   1. Per-product tracking — one email can register interest in multiple
--      SKUs; the unique index is on (lower(email), product_sku), so a
--      footer-newsletter subscriber can ALSO request a MOTS-C alert without
--      the email-level unique constraint blocking them.
--   2. Launch-blast targeting — when a SKU goes live, query this table by
--      product_sku to email exactly the people who asked about THAT product,
--      then stamp notified_at so they aren't re-pinged.
--
-- Not sending from inside the app yet — rows are exported to the ESP (or
-- queried + blasted manually) when a SKU ships.

CREATE TABLE IF NOT EXISTS product_notify_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text NOT NULL,
  product_sku  text NOT NULL,
  product_id   text,
  status       text NOT NULL DEFAULT 'pending',
  ip           text,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  notified_at  timestamptz
);

-- One pending request per (email, product). Re-submitting the same email for
-- the same SKU is idempotent (insert returns 23505 → app treats as success
-- without leaking whether the email was already registered). Case-insensitive
-- on email, original casing preserved for ESP exact-match.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_notify_email_product
  ON product_notify_requests (lower(email), product_sku);

-- Launch-blast hot path: "give me everyone still waiting on this SKU".
CREATE INDEX IF NOT EXISTS idx_notify_sku_status
  ON product_notify_requests (product_sku, status);

-- Service-role only — no public read/write. The /api/notify/subscribe route
-- writes via the service-role client (bypasses RLS); the anon PostgREST
-- endpoint is fully blocked, same posture as newsletter_subscribers.
ALTER TABLE product_notify_requests ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE product_notify_requests IS
  'Per-product back-in-stock / preorder notify-me requests. Query by product_sku to blast a launch list; stamp notified_at after.';
COMMENT ON COLUMN product_notify_requests.status IS
  '''pending'' = still waiting, ''notified'' = launch email sent (set notified_at when flipping).';

NOTIFY pgrst, 'reload schema';
