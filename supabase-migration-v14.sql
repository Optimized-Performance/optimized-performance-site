-- =========================================
-- Migration v14: Move COA PDFs from /public to Supabase Storage
-- Paste into Supabase → SQL Editor → New query → Run
-- Idempotent — safe to re-run.
-- =========================================
--
-- Background: v11 stored coa_pdf_path as a relative path under /public, with
-- the /coa/[sku]/[lot].js route reading the file from disk via fs.readFileSync.
-- That works in local dev but FAILS on Vercel: /public is read-only after
-- build, so PDFs uploaded at runtime never persist. Vanguard returns COAs by
-- email; admin needs to upload them via the dashboard, not commit-and-redeploy
-- per lot.
--
-- Fix: move COA PDFs to Supabase Storage. The coa_pdf_path column stays text,
-- but the semantics change — it now holds the object KEY inside the 'coas'
-- bucket (e.g., 'op-bpc-5mg/260509.pdf'), not a /public-relative path.
--
-- This migration only updates documentation; the real change is application
-- code (route handler reads from storage, new admin upload endpoint writes to
-- it). Existing rows with /public-style paths will fail-soft to the
-- 'file_missing' branch on the COA route, which is the correct behavior — no
-- real COA PDFs are filed pre-launch yet, so there's nothing to migrate.
--
-- =========================================
-- Manual setup (one-time, in Supabase dashboard):
-- =========================================
--   1. Storage → New bucket → name: 'coas' → Public bucket: OFF (private).
--   2. No RLS policies needed — both the upload endpoint and the COA route
--      use the service-role key, which bypasses RLS.
--   3. Optional: enable file size limit at 10 MB and MIME-type whitelist
--      for application/pdf only (UI: bucket settings → File Size Limit).
-- =========================================

COMMENT ON COLUMN batches.coa_pdf_path IS
  'Object key in the Supabase Storage bucket "coas" (e.g., "op-bpc-5mg/260509.pdf"). Convention is {sku}/{lot_number}.pdf. Uploaded via /api/admin/batches/upload-coa from the BatchesTab admin UI when Vanguard returns a report. The /coa/{sku}/{lot} route streams this object inline so the public URL stays stable for printed QR codes. NULL until the lab returns the file; the route renders a friendly "preliminary pending" page in that case.';

NOTIFY pgrst, 'reload schema';
