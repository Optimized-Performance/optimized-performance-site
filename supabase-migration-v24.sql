-- Migration v24: marketing-email foundation.
--
--   email_suppressions   — the unsubscribe / bounce / complaint list. Every
--                          marketing send checks this first (CAN-SPAM + keeps
--                          the sending domain's reputation clean). Transactional
--                          mail (order/shipping/recovery) does NOT honor this —
--                          a customer can't unsubscribe from their own receipts.
--   replenishment_nudges  — idempotency log for the "running low?" cron so a
--                          given (email, product) is nudged at most once per
--                          reorder cycle.
--
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS email_suppressions (
  id          bigint generated always as identity primary key,
  email       text not null,
  reason      text,                 -- 'unsubscribe' | 'bounce' | 'complaint' | 'manual'
  created_at  timestamptz not null default now()
);
-- Case-insensitive unique so re-suppressing is a no-op and lookups are cheap.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_suppressions_email
  ON email_suppressions (lower(email));

CREATE TABLE IF NOT EXISTS replenishment_nudges (
  id          bigint generated always as identity primary key,
  email       text not null,
  product_id  text not null,
  sent_at     timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS idx_replenishment_nudges_lookup
  ON replenishment_nudges (lower(email), product_id, sent_at desc);
