-- v31: order editing + partial payment (balance-due) support
--
-- Adds the money-truth needed to edit an existing order and invoice the
-- difference: amount_paid tracks what's actually been collected (vs total = the
-- current authoritative order total), and edit_history is an append-only audit
-- trail of every admin edit. A completed order edited upward flips to the new
-- 'balance_due' payment_status until the added balance is paid.
--
-- Idempotent (IF NOT EXISTS + guarded backfill). Safe to re-run.

alter table orders add column if not exists amount_paid numeric default 0;
alter table orders add column if not exists edit_history jsonb default '[]'::jsonb;

-- Backfill: a completed order has, by definition, collected its full total.
-- Everything else (awaiting/pending/abandoned/refunded) has collected nothing
-- currently held, so it stays at the 0 default. Only touch rows still at 0 so a
-- re-run never clobbers a value the app has since written.
update orders
  set amount_paid = total
  where payment_status = 'completed'
    and (amount_paid is null or amount_paid = 0);
