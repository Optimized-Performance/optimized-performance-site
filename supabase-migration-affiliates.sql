-- =========================================
-- Affiliates migration — idempotent, safe to re-run
-- Paste into Supabase → SQL Editor → New query → Run
-- =========================================

-- 1. Affiliates table
CREATE TABLE IF NOT EXISTS affiliates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  code text UNIQUE NOT NULL,
  discount_pct numeric(5,2) DEFAULT 10 NOT NULL,
  commission_pct numeric(5,2) DEFAULT 5 NOT NULL,
  active boolean DEFAULT true,
  notes text,
  total_sales integer DEFAULT 0,
  total_revenue numeric(10,2) DEFAULT 0,
  total_commission numeric(10,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliates_code ON affiliates(code);
CREATE INDEX IF NOT EXISTS idx_affiliates_active ON affiliates(active);

-- 2. Order columns for affiliate attribution
ALTER TABLE orders ADD COLUMN IF NOT EXISTS affiliate_code text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS affiliate_commission_pct numeric(5,2) DEFAULT 0;

-- 3. Row-level security — admin-only, service role bypasses RLS
ALTER TABLE affiliates ENABLE ROW LEVEL SECURITY;
