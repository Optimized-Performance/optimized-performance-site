-- Atomic inventory decrement — fixes the oversell race in lib/payments/finalizeOrder.js
--
-- Before: finalize did SELECT stock → compute (stock - qty) in JS → UPDATE.
-- Two concurrent finalizes for the same SKU both read the same stock and one
-- decrement is lost → oversell. This function does the decrement in a single
-- locked statement so concurrent calls serialize correctly.
--
-- Returns the post-decrement stock, the row's thresholds (for the low-stock
-- alert), the product name, and whether the order drove stock below 0
-- (oversold — clamped to 0 but flagged so finalizeOrder can log it).
--
-- SAFE TO RUN ANYTIME: finalizeOrder.js calls this via rpc and falls back to
-- the old read-modify-write if the function is absent, so deploy order doesn't
-- matter — but the oversell race is only fixed once this exists in prod.
--
-- Run in the Supabase SQL editor (Primary Database, role postgres).

create or replace function public.decrement_inventory(p_sku text, p_qty integer)
returns table (
  out_new_stock integer,
  out_threshold integer,
  out_reorder integer,
  out_product text,
  out_oversold boolean
)
language plpgsql
as $$
declare
  v_before integer;
begin
  -- Row lock serializes concurrent decrements for the same SKU.
  select stock into v_before from public.inventory where sku = p_sku for update;
  if not found then
    return;  -- no inventory row for this SKU → empty result; caller skips
  end if;

  update public.inventory
     set stock = greatest(0, v_before - p_qty)
   where sku = p_sku
  returning stock, threshold, reorder_threshold, product
       into out_new_stock, out_threshold, out_reorder, out_product;

  out_oversold := (v_before - p_qty) < 0;
  return next;
end;
$$;
