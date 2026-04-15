-- Migration v4: Admin data to DB + RLS + webhook replay protection
-- Run this in Supabase SQL Editor

-- =========================================
-- 1. AFFILIATES TABLE (for server-side codes)
-- =========================================
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

-- =========================================
-- 2. SUPPLY LOTS TABLE
-- =========================================
CREATE TABLE IF NOT EXISTS supply_lots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id text NOT NULL,
  lot_number text NOT NULL,
  supplier_lot text,
  date_received date,
  qty_vials integer DEFAULT 0,
  qty_remaining integer DEFAULT 0,
  coa_on_file boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lots_product_id ON supply_lots(product_id);

-- =========================================
-- 3. ORDER TABLE UPDATES (for fulfillment tracking + replay protection)
-- =========================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_status text DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes text;

-- Ensure moonpay_tx_id is UNIQUE for replay protection
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_moonpay_tx_id_key'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_moonpay_tx_id_key UNIQUE (moonpay_tx_id);
  END IF;
END $$;

-- =========================================
-- 4. WEBHOOK EVENTS TABLE (replay protection)
-- =========================================
CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  provider text NOT NULL,
  event_id text NOT NULL,
  tx_id text,
  processed_at timestamptz DEFAULT now(),
  UNIQUE(provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_lookup ON webhook_events(provider, event_id);

-- =========================================
-- 5. ROW LEVEL SECURITY (RLS)
-- =========================================

-- Inventory: public read (limited), only service role can write
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read inventory stock" ON inventory;
CREATE POLICY "Public can read inventory stock"
  ON inventory FOR SELECT
  TO anon, authenticated
  USING (true);

-- Orders: NO public access, only service role
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
-- (no policies = no access for anon/authenticated; service role bypasses RLS)

-- Affiliates: only service role
ALTER TABLE affiliates ENABLE ROW LEVEL SECURITY;

-- Supply lots: only service role
ALTER TABLE supply_lots ENABLE ROW LEVEL SECURITY;

-- Webhook events: only service role
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- =========================================
-- DONE
-- =========================================
-- After running this, your Supabase tables will show:
-- - inventory: RLS enabled, public read only
-- - orders, affiliates, supply_lots, webhook_events: RLS enabled, service-only
-- - orders.moonpay_tx_id: UNIQUE constraint prevents webhook replays
