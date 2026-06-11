-- Migration v27: customer email verification (account dashboard build).
--
-- Order history in /account is shown only for VERIFIED emails — without this,
-- anyone could register someone else's email and read their order history
-- (items + shipping address). Purchasing is NOT gated on verification (the
-- account gate alone satisfies the processor requirement); verification gates
-- only the data-revealing surfaces.
--
-- Safe to re-run.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS verified_at timestamptz;

COMMENT ON COLUMN customers.email_verified IS
  'True once the customer clicks the signed verify link emailed at registration. Gates order-history visibility in /account, never purchasing.';
