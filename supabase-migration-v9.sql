-- =========================================
-- Migration v9: Inbound email bot — admin inbox triage + drafted replies
-- Paste into Supabase → SQL Editor → New query → Run
-- Idempotent — safe to re-run.
-- =========================================
--
-- Stores every email received via SendGrid Inbound Parse on
-- bot@inbound.optimizedperformancepeptides.com. The bot classifies each
-- message via Claude, looks up any related order, and either:
--   - Auto-replies for simple lookups (order status, tracking)
--   - Drafts a reply for admin to review (refunds, partnerships, other)
--   - Escalates to admin without action (legal, compliance)
--   - Archives (spam)
--
-- Admin reviews + sends drafts via the Inbox tab. See:
--   /api/inbound-email   — SendGrid webhook handler
--   /api/admin/inbox     — admin CRUD on inbox
--   src/lib/email-bot.js — classification + reply generation

CREATE TABLE IF NOT EXISTS inbound_emails (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Email metadata (parsed by SendGrid Inbound Parse, not raw MIME)
  from_email text NOT NULL,
  from_name text,
  to_email text,
  subject text,
  body_text text,
  body_html text,
  spam_score numeric,

  -- Bot classification — set by /api/inbound-email after Claude triage
  classification text,
  -- One of: 'order_status' | 'tracking' | 'refund_request' | 'partnership'
  --        | 'legal_compliance' | 'spam' | 'other'
  classification_reason text,
  related_order_number text,

  -- Lifecycle status — drives the admin Inbox UI filters
  status text NOT NULL DEFAULT 'new',
  -- 'new'           — just received, not yet processed
  -- 'auto_replied'  — bot already sent a canned reply (order status / tracking)
  -- 'draft_pending' — bot drafted a reply, waiting for admin approval
  -- 'sent'          — admin approved + sent the draft
  -- 'archived'      — admin marked as no-action / informational
  -- 'spam'          — bot or admin flagged as spam
  -- 'escalated'     — flagged for admin attention (legal/compliance), no auto-action

  -- Reply (either auto-sent or pending draft)
  reply_subject text,
  reply_body text,
  reply_sent_at timestamptz,
  reply_edited_by_admin boolean DEFAULT false,

  created_at timestamptz DEFAULT now(),
  processed_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inbound_emails_status ON inbound_emails(status);
CREATE INDEX IF NOT EXISTS idx_inbound_emails_created ON inbound_emails(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbound_emails_pending ON inbound_emails(status)
  WHERE status IN ('new', 'draft_pending', 'escalated');

COMMENT ON TABLE inbound_emails IS
  'Inbound customer emails forwarded to the bot via SendGrid Inbound Parse on inbound.optimizedperformancepeptides.com. Each row tracks the raw email, the bot''s classification, and the reply lifecycle (auto-reply, drafted, sent, archived, spam, escalated).';

COMMENT ON COLUMN inbound_emails.classification IS
  'Bot triage bucket. order_status/tracking auto-reply; refund_request/partnership/other are drafted for admin review; legal_compliance is escalated without auto-action; spam is archived.';

COMMENT ON COLUMN inbound_emails.status IS
  'Lifecycle: new → (auto_replied | draft_pending | escalated | spam) → (sent | archived). Driven by the bot at /api/inbound-email and the admin Inbox tab.';

ALTER TABLE inbound_emails ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
