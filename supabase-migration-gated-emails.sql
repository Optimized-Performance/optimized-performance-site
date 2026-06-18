-- ============================================================
-- Account-gated allowlist, BY EMAIL (Matt's call: most buyers are guests, so
-- granting by account would force them to register first). Grant = insert an
-- email here; it takes effect the moment that person logs in with that email.
-- A logged-in customer whose email is in this table sees visibility_tier=
-- 'account_gated' SKUs. Purely additive; safe to run anytime.
-- ============================================================
create table if not exists gated_emails (
  email      text primary key,   -- store lowercased/trimmed (the admin endpoint normalizes)
  note       text,               -- optional admin note (who/why)
  created_at timestamptz not null default now()
);
