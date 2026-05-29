-- Migration v21: customers table (self-registration for account-gated checkout)
--
-- Backs the "account required to purchase" gate (NEXT_PUBLIC_REQUIRE_ACCOUNT).
-- Ships OFF; flip the flag on when a processor (e.g. AllayPay) requires
-- account-gated purchasing. Run this BEFORE flipping the flag, and set
-- CUSTOMER_SESSION_SECRET in Vercel env. Idempotent.
--
-- RLS on with no policies -> service-role-only access (same posture as
-- newsletter_subscribers v16 and product_notify_requests v19). All reads/writes
-- go through supabaseAdmin in the API routes.

CREATE TABLE IF NOT EXISTS customers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  password_hash text NOT NULL,
  name          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

-- Case-insensitive unique email (mirrors newsletter_subscribers).
CREATE UNIQUE INDEX IF NOT EXISTS customers_email_lower_idx ON customers (lower(email));

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
