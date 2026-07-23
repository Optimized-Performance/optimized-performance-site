-- ============================================================
-- Researcher-access application queue (2026-07-22). Backs the admin Requests
-- tab + gives approve/deny history. The /research-inquiries form writes a row
-- here (status='pending'); approving (via the email one-tap OR the admin tab)
-- adds the email to gated_emails and flips status to 'approved'. Purely
-- additive; the email-approve flow works without it (idempotent), this just
-- adds the durable queue. Safe to run anytime.
-- ============================================================
create table if not exists research_access_requests (
  id           uuid default gen_random_uuid() primary key,
  name         text,
  email        text not null,
  institution  text,
  role         text,
  intended_use text,
  status       text not null default 'pending',  -- pending | approved | denied
  created_at   timestamptz not null default now(),
  decided_at   timestamptz
);
create index if not exists idx_rar_status_created on research_access_requests(status, created_at desc);
create index if not exists idx_rar_email on research_access_requests(lower(email));
