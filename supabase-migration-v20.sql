-- Migration v20: research_field on orders
--
-- Captures the customer-declared research field selected at checkout
-- (Pharmacology / Molecular Biology / Medicinal Chemistry / Biochemistry /
-- Clinical Research / Other). High-risk card underwriting (AllayPay et al.)
-- requires the buyer to affirm a research purpose; storing it per order gives
-- the audit trail the same durability as the existing research-use ack.
--
-- Idempotent. Run in the Supabase SQL editor BEFORE wiring
-- insertData.research_field in src/pages/api/orders/create.js. As of the
-- accompanying commit, the field is ENFORCED at checkout + server-side and
-- accepted in the payload, but NOT yet written to the DB (avoids a failed
-- insert before this column exists). After running this, add
-- `research_field: researchField` to the insertData object to persist it.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS research_field TEXT;
