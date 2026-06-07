-- Migration v25: broadcast composer + back-in-stock auto-email.
--
--   email_broadcasts            — history/audit log of admin-sent broadcasts
--                                 (sale / new-item blasts). One row per send.
--   product_notify_requests.notified_at — stamp so a "back in stock" email goes
--                                 out at most once per waiting customer when a
--                                 product they asked about returns to stock.
--
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS email_broadcasts (
  id              bigint generated always as identity primary key,
  subject         text not null,
  segment         text not null,         -- 'purchasers' | 'newsletter' | 'all'
  recipient_count integer not null default 0,
  sent_count      integer not null default 0,
  suppressed_count integer not null default 0,
  failed_count    integer not null default 0,
  created_at      timestamptz not null default now()
);

ALTER TABLE product_notify_requests ADD COLUMN IF NOT EXISTS notified_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_product_notify_pending
  ON product_notify_requests (product_sku)
  WHERE notified_at IS NULL;
