-- Migration v26: first-party funnel instrumentation.
--
--   events            — lightweight anonymous behavioral events (page/product
--                       view, add-to-cart, checkout-start, payment-attempt),
--                       tagged with an anonymous session id + affiliate ref, so
--                       the TOP of the funnel (everything before an order row
--                       exists) becomes visible. No PII at browse time.
--   orders.session_id — stamped at order create from the client's session id, so
--                       a buyer's full pre-order path joins to their order.
--
-- Ingested via /api/track using the service role (RLS on, no policies — the
-- anon key can neither read behavioral data nor write events). Safe to re-run.

CREATE TABLE IF NOT EXISTS events (
  id          bigint generated always as identity primary key,
  session_id  text not null,
  event_type  text not null,          -- page_view | product_view | add_to_cart | checkout_start | payment_attempt
  path        text,
  product_id  text,
  ref         text,                   -- affiliate code / source the session arrived on
  value       numeric,                -- cart/order value where relevant
  meta        jsonb,
  created_at  timestamptz not null default now()
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_events_created     ON events (created_at);
CREATE INDEX IF NOT EXISTS idx_events_type_created ON events (event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_events_session     ON events (session_id);
CREATE INDEX IF NOT EXISTS idx_events_ref         ON events (ref);
CREATE INDEX IF NOT EXISTS idx_events_product     ON events (product_id) WHERE product_id IS NOT NULL;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS session_id text;
CREATE INDEX IF NOT EXISTS idx_orders_session ON orders (session_id) WHERE session_id IS NOT NULL;
