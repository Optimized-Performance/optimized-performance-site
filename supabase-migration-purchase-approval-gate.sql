-- ============================================================
-- Purchase-approval gate (2026-07-22). Adds a per-SKU flag that decouples
-- LISTING visibility from PURCHASE eligibility, so a product can be openly
-- listed + crawlable (de-cloaked, per the Stripe/NoRamp remediation) while
-- still requiring an approved-researcher account to BUY it (the genuine
-- preventive control). Orthogonal to visibility_tier: adding the column
-- changes nothing until it's set true on specific SKUs. Safe to run anytime.
--
-- Enforcement: /api/orders/create rejects any cart containing a
-- purchase_approval_required SKU unless the requester passes hasGatedAccess()
-- (logged-in account whose email is on the gated_emails allowlist — see
-- supabase-migration-gated-emails.sql). The catalog layer maps this column to
-- `purchaseApprovalRequired`.
--
-- The peptide/compound SKUs are flipped ON in a SEPARATE deliberate step
-- (together with visibility_tier='public' to expose them + the copy reframe),
-- AFTER the gate is verified. This migration only adds the column.
-- ============================================================
alter table products
  add column if not exists purchase_approval_required boolean not null default false;
