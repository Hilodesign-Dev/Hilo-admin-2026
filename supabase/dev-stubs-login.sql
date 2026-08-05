-- Extra stubs for tables the app hits on login (run AFTER dev-bootstrap.sql)
-- Paste into Supabase SQL Editor for project gqxuirjakbsrltlqapev

create table if not exists public.outsource_vendors (
  id uuid primary key default gen_random_uuid(),
  name text,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  code text,
  name text,
  state text,
  state_code text,
  gstin text,
  invoice_prefix text,
  is_online boolean default false,
  is_active boolean default true,
  location_type text default 'store',
  channel_id uuid,
  created_at timestamptz default now()
);

create table if not exists public.loyalty_tiers (
  id uuid primary key default gen_random_uuid(),
  key text,
  label text,
  badge_icon text,
  color text,
  bg_color text,
  discount_pct numeric default 0,
  points_multiplier numeric default 1,
  sort_order int default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.catalogue_products (
  id uuid primary key default gen_random_uuid(),
  product_title text,
  category text,
  status text default 'Draft',
  variants jsonb default '[]'::jsonb,
  shopify_product_id text,
  shopify_images jsonb default '[]'::jsonb,
  image_url text,
  deleted_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text,
  sort_order int default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text,
  phone text,
  created_at timestamptz default now()
);

create table if not exists public.shopify_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text,
  customer_name text,
  customer_email text,
  created_at timestamptz default now()
);

create table if not exists public.order_line_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

do $$
declare
  t text;
  pol text;
begin
  foreach t in array array[
    'outsource_vendors','stores','loyalty_tiers','catalogue_products',
    'departments','customers','shopify_orders','order_line_items'
  ]
  loop
    pol := 'dev_all_' || t;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', pol, t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      pol, t
    );
  end loop;
end $$;
