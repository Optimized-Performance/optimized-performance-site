-- Migration v28: secondary affiliate codes under one login ("same person,
-- second code"). Lets an affiliate (e.g. Tris) run more than one code with
-- different discount/commission splits and see them all from ONE dashboard.
--
-- owner_affiliate_id is DELIBERATELY DISTINCT from parent_affiliate_id:
--   parent_affiliate_id = recruiter network. A recruit's volume pays the
--       recruiter a recruiter_override_pct and the monthly cron claws the
--       recruit's own rate down by that override. Used for DIFFERENT people.
--   owner_affiliate_id  = the SAME person's secondary code. No override, no
--       claw-down — it's just another of this person's own codes, surfaced
--       together on their dashboard. The tier-ratchet skips these rows so a
--       deliberately-set split is never auto-overwritten.
--
-- A row with owner_affiliate_id set is a "secondary" code; its owner is the
-- "primary" (the row the person logs into). Secondary rows generally have no
-- login_password_hash of their own — login always resolves to the primary.
--
-- Safe to re-run.

ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS owner_affiliate_id uuid REFERENCES affiliates(id);
ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS code_label text;

CREATE INDEX IF NOT EXISTS idx_affiliates_owner ON affiliates(owner_affiliate_id);

COMMENT ON COLUMN affiliates.owner_affiliate_id IS
  'Self-FK. When set, this row is a SECONDARY code belonging to the referenced primary affiliate (same person, different split). Distinct from parent_affiliate_id (recruiter network). Tier-ratchet skips these rows.';
COMMENT ON COLUMN affiliates.code_label IS
  'Optional human label for a code shown on the dashboard breakdown, e.g. "Skool community". Falls back to the code itself.';

-- ============================================================================
-- ACTIVATION — links Tris's Skool code (SYNGYN) to his primary login.
-- Resolves the owner by SAME EMAIL (no need to know his main code): picks the
-- other affiliate row sharing SYNGYN's email that is itself a primary (no
-- owner) and is loginnable (has a password). Fully idempotent + self-contained
-- — safe to run with the rest of this file, and safe to re-run.
-- ============================================================================
UPDATE affiliates
SET owner_affiliate_id = (
      SELECT p.id
      FROM affiliates p
      WHERE lower(p.email) = (SELECT lower(email) FROM affiliates WHERE code = 'SYNGYN')
        AND p.code <> 'SYNGYN'
        AND p.owner_affiliate_id IS NULL
      ORDER BY (p.login_password_hash IS NOT NULL) DESC, p.created_at ASC
      LIMIT 1
    ),
    code_label = 'Skool community',
    updated_at = now()
WHERE code = 'SYNGYN';
