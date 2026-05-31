-- Migration v22: rail_config — payment-rail orchestration / volume throttle.
--
-- Backs the rail-orchestration engine (docs/rail-orchestration-spec.md): caps
-- per-rail monthly/daily volume so no single freezable rail (PayPal, honest card
-- acquirer) trips its AML/velocity freeze line; overflow routes to the uncapped
-- durable rails (crypto, Zelle). Caps are EDITABLE from admin (Rails tab) — they
-- are empirical and ratcheted as each rail proves what it survives. Idempotent.

CREATE TABLE IF NOT EXISTS rail_config (
  rail              text PRIMARY KEY,         -- matches orders.payment_method
  display_name      text NOT NULL,
  rail_type         text NOT NULL,            -- 'card' | 'durable' | 'p2p'
  enabled           boolean NOT NULL DEFAULT true,
  monthly_cap       numeric,                  -- USD; NULL = uncapped (durable rails)
  daily_cap         numeric,                  -- USD; NULL = derive monthly/30*1.5
  sort_order        integer NOT NULL DEFAULT 100, -- fallback priority (lower = preferred)
  large_order_block boolean NOT NULL DEFAULT false, -- phase 2: suppress for big tickets
  notes             text,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rail_config ENABLE ROW LEVEL SECURITY;

-- Seed (conservative starting caps — tune up in admin as rails prove out).
-- Only PayPal + the honest card acquirer are capped; crypto + Zelle uncapped.
INSERT INTO rail_config (rail, display_name, rail_type, enabled, monthly_cap, daily_cap, sort_order, notes) VALUES
  ('card',   'Card (honest acquirer)', 'card',    true,  50000, NULL, 10, 'AllayPay/etc — contractual approved cap; run to it, negotiate up'),
  ('paypal', 'PayPal',                 'card',    true,  60000, 3000, 20, 'Category-misrep rail — ramp <= +50%/mo (manual bump); a spike triggers review = total loss'),
  ('zelle',  'Zelle',                  'durable', true,  NULL,  NULL, 30, 'Uncapped release valve — bank-to-bank, no platform AUP, no receiving limits'),
  ('crypto', 'Crypto (NOWPayments)',   'durable', true,  NULL,  NULL, 40, 'Uncapped release valve — self-custody; real limit is Kraken off-ramp velocity'),
  ('venmo',  'Venmo',                  'p2p',     true,  10000, NULL, 90, 'AUP-fragile — keep off the July bolus')
ON CONFLICT (rail) DO NOTHING;
