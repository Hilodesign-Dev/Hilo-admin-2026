-- Sync integrity: stable Shopify keys, duplicate cleanup, and a one-run-at-a-time lock.
-- Run in the Supabase SQL Editor BEFORE deploying the rewritten sync-* Edge Functions.
-- Safe to re-run. Nothing here hard-deletes rows; the optional cleanups at the bottom
-- are commented out so you can preview them first.

begin;

-- ── 1. catalogue_products: one row per Shopify product ─────────────────────────
-- Duplicates (same shopify_product_id) are kept but retired: soft-deleted and their
-- key renamed to "dup:<row id>:<original>" so the unique index can be created.
-- The survivor is the live row (deleted_at is null) that was created most recently.
with ranked as (
  select id,
         shopify_product_id,
         row_number() over (
           partition by shopify_product_id
           order by (deleted_at is null) desc, created_at desc nulls last, id
         ) as rn
  from public.catalogue_products
  where shopify_product_id is not null and shopify_product_id <> ''
)
update public.catalogue_products p
set shopify_product_id = 'dup:' || p.id || ':' || r.shopify_product_id,
    deleted_at = coalesce(p.deleted_at, now())
from ranked r
where p.id = r.id and r.rn > 1;

create unique index if not exists catalogue_products_shopify_product_id_key
  on public.catalogue_products (shopify_product_id);

-- ── 2. shopify_orders / order_line_items: key on Shopify ids ───────────────────
alter table public.shopify_orders add column if not exists shopify_order_id text;
create unique index if not exists shopify_orders_shopify_order_id_key
  on public.shopify_orders (shopify_order_id);

-- Real line-item fields (the old sync inserted rows with only order_id).
alter table public.order_line_items add column if not exists shopify_line_item_id text;
alter table public.order_line_items add column if not exists order_number text;
alter table public.order_line_items add column if not exists title text;
alter table public.order_line_items add column if not exists sku text;
alter table public.order_line_items add column if not exists quantity int;
alter table public.order_line_items add column if not exists unit_price numeric;
alter table public.order_line_items add column if not exists sale_price numeric;
alter table public.order_line_items add column if not exists size text;
create unique index if not exists order_line_items_shopify_line_item_id_key
  on public.order_line_items (shopify_line_item_id);

-- ── 3. customers: key on Shopify id (email can be null) ────────────────────────
alter table public.customers add column if not exists shopify_customer_id text;
alter table public.customers add column if not exists updated_at timestamptz default now();
create unique index if not exists customers_shopify_customer_id_key
  on public.customers (shopify_customer_id);

-- ── 4. sync_runs: at most one running sync per type ────────────────────────────
-- A second sync of the same type fails to insert its 'started' row and is skipped.
update public.sync_runs
set status = 'failed', finished_at = now(), error = coalesce(error, 'stale run closed by migration')
where status = 'started' and started_at < now() - interval '15 minutes';

-- Older runs may still overlap; keep only the newest 'started' row per type.
with ranked as (
  select id, row_number() over (partition by sync_type order by started_at desc) as rn
  from public.sync_runs where status = 'started'
)
update public.sync_runs s
set status = 'failed', finished_at = now(), error = coalesce(s.error, 'superseded by migration')
from ranked r where s.id = r.id and r.rn > 1;

create unique index if not exists sync_runs_one_running_per_type
  on public.sync_runs (sync_type) where status = 'started';

commit;

-- ── Optional cleanup of rows the old functions created (preview first) ─────────
--
-- a) Empty line items inserted by the old sync-orders (no title, sku or quantity).
--    App-order handoff rows always carry a title, so they are not matched.
-- select count(*) from public.order_line_items
--   where shopify_line_item_id is null and title is null and sku is null and quantity is null;
-- delete from public.order_line_items
--   where shopify_line_item_id is null and title is null and sku is null and quantity is null;
--
-- b) Customer duplicates created on every run for customers without an email.
--    Keeps the oldest row per (name, phone) among rows with no email.
--    Check the preview: two different people with the same name and no phone would merge.
--    Simplest alternative: delete all email-less rows with no shopify_customer_id, then run
--    a full customer sync (body { full_sync: true }) to recreate them with stable ids.
-- select name, phone, count(*) from public.customers
--   where email is null and shopify_customer_id is null
--   group by name, phone having count(*) > 1;
-- delete from public.customers c using (
--   select id, row_number() over (partition by name, phone order by created_at, id) as rn
--   from public.customers where email is null and shopify_customer_id is null
-- ) d where c.id = d.id and d.rn > 1;
