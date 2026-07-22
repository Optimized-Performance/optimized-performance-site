-- Purchase-approval gate — 2026-07-22.
-- Adds a per-SKU flag that decouples LISTING visibility from PURCHASE
-- eligibility, so a product can be openly listed + crawlable (de-cloaked, per
-- the Stripe/NoRamp remediation) while still requiring an approved-researcher
-- account to actually buy it (the genuine preventive control, finding #3).
--
-- Orthogonal to visibility_tier on purpose: adding the column changes NOTHING
-- until it's set true on specific SKUs, and it never touches how anything is
-- currently listed. Run once in the Supabase SQL editor.
--
-- Enforcement: /api/orders/create rejects any cart containing a
-- purchase_approval_required SKU unless the requester passes hasGatedAccess()
-- (logged-in account whose email is on the gated_emails allowlist). The catalog
-- layer maps this to `purchaseApprovalRequired`.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS purchase_approval_required boolean NOT NULL DEFAULT false;

-- NOTE: the peptide/compound SKUs are flipped ON in a SEPARATE, deliberate step
-- (together with visibility_tier='public' to expose them + the copy reframe),
-- AFTER the gate is verified working. This migration only adds the column.
