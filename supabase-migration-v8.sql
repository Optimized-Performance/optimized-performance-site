-- =========================================
-- Migration v8: Chargebacks log + ratio tracking
-- Paste into Supabase → SQL Editor → New query → Run
-- Idempotent — safe to re-run.
-- =========================================
--
-- High-risk merchants (peptides, supplements, CBD, etc.) live or die by their
-- chargeback ratio. Visa/Mastercard run dispute monitoring programs that
-- escalate fines and can lead to MATCH-list termination if the ratio crosses
-- thresholds (Visa VDMP: 0.9% / 100+ disputes, Mastercard ECP: 1.5%, etc.).
--
-- This table records every chargeback / dispute received, regardless of
-- outcome, so the admin dashboard can compute the running ratio, surface
-- dispute reasons over time, and ensure no chargeback is forgotten about
-- before the response window closes.

CREATE TABLE IF NOT EXISTS chargebacks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Linkage to the order being disputed. order_id FK is preferred; order_number
  -- is a free-text fallback for cases where the disputed transaction can't
  -- be linked to a row in the orders table (e.g., legacy data or
  -- cross-processor migrations).
  order_id integer REFERENCES orders(id),
  order_number text,

  -- Categorization. reason_category is a coarse internal bucket;
  -- network_reason_code captures the Visa/MC-specific code when known
  -- (e.g., "10.4 Other Fraud — Card-Absent Environment").
  reason_category text NOT NULL,             -- 'fraud' | 'not_received' | 'not_as_described' | 'duplicate' | 'technical' | 'other'
  network_reason_code text,                  -- e.g., '10.4', '13.1', '4853'

  -- Money + timing
  amount numeric(10,2) NOT NULL,
  filed_at timestamptz NOT NULL DEFAULT now(),
  response_due_at timestamptz,                -- Set by admin from the processor notification
  resolved_at timestamptz,                    -- Set when status moves to won / lost / withdrawn

  -- Lifecycle status
  status text NOT NULL DEFAULT 'open',        -- 'open' | 'responded' | 'won' | 'lost' | 'withdrawn'

  -- Processor that the chargeback came through (for cross-processor analytics).
  processor text NOT NULL DEFAULT 'bankful',  -- 'bankful' | 'elite' | 'moonpay' | 'other'
  processor_case_id text,                     -- Their internal case / dispute ID

  -- Free-text fields
  customer_email text,
  notes text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chargebacks_filed_at ON chargebacks(filed_at);
CREATE INDEX IF NOT EXISTS idx_chargebacks_status ON chargebacks(status);
CREATE INDEX IF NOT EXISTS idx_chargebacks_order ON chargebacks(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chargebacks_response_due ON chargebacks(response_due_at)
  WHERE status = 'open' AND response_due_at IS NOT NULL;

COMMENT ON TABLE chargebacks IS
  'Every chargeback / dispute received, used by the admin Chargebacks tab to track response deadlines, win/loss outcomes, and the running chargeback ratio for monitoring against Visa/MC threshold programs.';

COMMENT ON COLUMN chargebacks.reason_category IS
  'Coarse internal bucket — fraud, not_received, not_as_described, duplicate, technical, other. Used for trend analysis. The Visa/MC-specific code lives in network_reason_code.';

COMMENT ON COLUMN chargebacks.status IS
  'open = newly filed, awaiting response; responded = evidence submitted, awaiting decision; won = chargeback reversed in our favor; lost = chargeback upheld, funds debited; withdrawn = customer withdrew the dispute.';

-- RLS — admin only via service role
ALTER TABLE chargebacks ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
