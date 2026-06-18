-- ============================================================
-- Storage bucket for SKU thumbnails (Build 2). Public-read bucket; uploads get
-- UNGUESSABLE filenames (uuid) so a public URL can't be enumerated to reveal a
-- restricted SKU's image — and getClientSafeCatalog already strips restricted
-- SKUs (incl. their image_url) from unauthorized clients, so the URL only ever
-- reaches viewers allowed to see the SKU. Additive; safe to run anytime.
-- (If you'd rather, create the bucket in the Supabase dashboard: Storage ->
--  New bucket -> name "product-images", Public ON.)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;
