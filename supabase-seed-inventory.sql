-- Seed inventory table with current product catalog
-- Run this in Supabase SQL Editor AFTER supabase-migration-v4.sql
-- Safe to re-run (uses UPSERT)

INSERT INTO inventory (product_id, product, size, sku, price, stock, threshold, reorder_threshold) VALUES
  ('glp3-10mg',   'GLP-3',                    '10mg',  'OP-GLP3-10MG',    114.95, 150, 20, 40),
  ('glp3-20mg',   'GLP-3',                    '20mg',  'OP-GLP3-20MG',    164.95, 100, 15, 30),
  ('bpc-5mg',     'BPC-157',                  '5mg',   'OP-BPC-5MG',       29.95, 100, 20, 40),
  ('bpc-10mg',    'BPC-157',                  '10mg',  'OP-BPC-10MG',      54.95,  75, 15, 30),
  ('tb500-5mg',   'TB-500',                   '5mg',   'OP-TB500-5MG',     44.95,  75, 15, 30),
  ('tb500-10mg',  'TB-500',                   '10mg',  'OP-TB500-10MG',    79.95,  50, 10, 20),
  ('combo-70mg',  'BPC + TB + GHK-CU Combo',  '70mg',  'OP-COMBO-70MG',    79.95,  40, 10, 20),
  ('ipa-5mg',     'Ipamorelin',               '5mg',   'OP-IPA-5MG',       29.95,  75, 15, 30),
  ('hgh-10iu',    'HGH 191AA',                '10IU',  'OP-HGH-10IU-KIT', 239.95, 150, 20, 40),
  ('mt2-5mg',     'MT-2',                     '5mg',   'OP-MT2-5MG',       29.95,  75, 15, 30),
  ('nad-500mg',   'NAD+',                     '500mg', 'OP-NAD-500MG',     57.95,  50, 10, 20)
ON CONFLICT (product_id) DO UPDATE SET
  product = EXCLUDED.product,
  size = EXCLUDED.size,
  sku = EXCLUDED.sku,
  price = EXCLUDED.price,
  stock = EXCLUDED.stock,
  threshold = EXCLUDED.threshold,
  reorder_threshold = EXCLUDED.reorder_threshold,
  updated_at = now();
