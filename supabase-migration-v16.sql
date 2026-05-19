-- =========================================
-- Migration v16: newsletter_subscribers
-- Paste into Supabase → SQL Editor → New query → Run
-- Idempotent — safe to re-run.
-- =========================================
--
-- Stores emails captured by the footer signup form across the site. Source
-- column tags where the signup came from ('footer' today; 'oos_alert',
-- 'home_hero', etc. can be added later without a schema change). Status
-- column lets admin soft-unsubscribe people without losing the row for
-- audit purposes. We're not sending newsletters from inside the app yet —
-- these rows are exported manually to whatever ESP we pick (Mailchimp /
-- Resend / etc.).

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text NOT NULL,
  source       text NOT NULL DEFAULT 'footer',
  status       text NOT NULL DEFAULT 'active',
  ip           text,
  user_agent   text,
  subscribed_at timestamptz NOT NULL DEFAULT now(),
  unsubscribed_at timestamptz,
  notes        text
);

-- Case-insensitive uniqueness on email — "Foo@bar.com" and "foo@bar.com"
-- collide. Done as a unique index on lower(email) so we can still preserve
-- the original casing the user typed (some ESPs match exact).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_newsletter_subscribers_email_lower
  ON newsletter_subscribers (lower(email));

-- Lookup by status for export queries (status='active' is the hot path).
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_status
  ON newsletter_subscribers (status);

COMMENT ON TABLE newsletter_subscribers IS
  'Footer email signups + future OOS/back-in-stock subscribers. Exported manually to the ESP when newsletters go out.';

COMMENT ON COLUMN newsletter_subscribers.source IS
  'Where the signup originated: ''footer'' (default), ''oos_alert'' (back-in-stock form), etc.';

COMMENT ON COLUMN newsletter_subscribers.status IS
  '''active'' for current subscribers, ''unsubscribed'' for users who opted out (kept for audit).';

NOTIFY pgrst, 'reload schema';
