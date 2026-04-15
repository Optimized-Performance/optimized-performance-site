-- Migration v4: Admin data to DB + RLS + webhook replay protection
-- Run this in Supabase SQL Editor
-- Safe to run multiple times (idempotent)

-- =========================================
-- 0. INVENTORY TABLE (create if missing)
-- =========================================
CREATE TABLE IF NOT EXISTS inventory (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id text UNIQUE NOT NULL,
  product text,
  size text,
  sku text,
  price numeric(10,2),
  stock integer DEFAULT 0,
  threshold integer DEFAULT 0,
  reorder_threshold integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_sku ON inventory(sku);

-- =========================================
-- 1. ORDERS TABLE (create if missing, add missing columns)
-- =========================================
CREATE TABLE IF NOT EXISTS orders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number text UNIQUE NOT NULL,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  shipping_address text,
  city text,
  state text,
  zip text,
  items jsonb,
  subtotal numeric(10,2),
  total numeric(10,2),
  discount numeric(10,2) DEFAULT 0,
  payment_status text DEFAULT 'pending',
  fulfillment_status text DEFAULT 'pending',
  moonpay_tx_id text,
  tracking text,
  notes text,
  affiliate_code text,
  affiliate_commission_pct numeric(5,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add columns if orders table existed without them
ALTER TABLE orders ADD COLUMN IF NOT EXISTS zip text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS items jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal numeric(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total numeric(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount numeric(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_status text DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS moonpay_tx_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS affiliate_code text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS affiliate_commission_pct numeric(5,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

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
-- 2. AFFILIATES TABLE
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
-- 3. SUPPLY LOTS TABLE
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

-- Inventory: public read only
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read inventory stock" ON inventory;
CREATE POLICY "Public can read inventory stock"
  ON inventory FOR SELECT
  TO anon, authenticated
  USING (true);

-- Orders: NO public access, only service role (bypasses RLS)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Affiliates: only service role
ALTER TABLE affiliates ENABLE ROW LEVEL SECURITY;

-- Supply lots: only service role
ALTER TABLE supply_lots ENABLE ROW LEVEL SECURITY;

-- Webhook events: only service role
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- =========================================
-- DONE
-- =========================================
