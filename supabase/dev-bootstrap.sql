-- ═══════════════════════════════════════════════════════════════════════════
-- Hilo Platform — MINIMAL DEV BOOTSTRAP (empty / test Supabase project)
-- ═══════════════════════════════════════════════════════════════════════════
-- What this gives you:
--   • Login shell works (Auth user + team_members row)
--   • Admin sees all tabs
--
-- What this does NOT give you:
--   • Full production schema (orders, finance, RPCs, edge functions, etc.)
--   • Those live only on the existing Hilo Supabase project — export/clone
--     them separately if you need a full mirror.
--
-- How to use:
--   1. Create a new Supabase project (free tier is fine)
--   2. Auth → Users → Add user (email + password, auto-confirm)
--   3. SQL Editor → paste this file → Run
--   4. Replace the placeholders in the INSERT at the bottom
--   5. Put URL + anon key in .env.local and npm run dev
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── team_members (required for app gate) ───────────────────────────────────
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete cascade,
  email text not null,
  name text,
  role text not null default 'admin',
  tabs jsonb default '[]'::jsonb,
  designation text,
  department text,
  avatar_url text,
  is_active boolean not null default true,
  deactivated_at timestamptz,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists team_members_user_id_idx on public.team_members (user_id);
create index if not exists team_members_email_idx on public.team_members (email);

alter table public.team_members enable row level security;

-- DEV-ONLY permissive policies (tighten before any real data / shared env)
drop policy if exists "dev_team_members_select" on public.team_members;
drop policy if exists "dev_team_members_insert" on public.team_members;
drop policy if exists "dev_team_members_update" on public.team_members;
drop policy if exists "dev_team_members_delete" on public.team_members;

create policy "dev_team_members_select" on public.team_members
  for select to authenticated using (true);

create policy "dev_team_members_insert" on public.team_members
  for insert to authenticated with check (true);

create policy "dev_team_members_update" on public.team_members
  for update to authenticated using (true) with check (true);

create policy "dev_team_members_delete" on public.team_members
  for delete to authenticated using (true);

-- Lightweight tables App.jsx touches on login (empty is OK; avoids hard crashes)
create table if not exists public.fabrics (
  id uuid primary key default gen_random_uuid(),
  name text,
  default_cost_per_metre numeric,
  cost_type text default 'per_metre',
  default_vendor_id uuid,
  description text,
  image_urls jsonb default '[]'::jsonb,
  fabric_family text,
  colour text,
  composition text,
  weave text,
  width_inches numeric,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.fabric_vendors (
  id uuid primary key default gen_random_uuid(),
  name text,
  shipping_address text,
  spoc_phone text,
  spoc_email text,
  gstin text,
  created_at timestamptz default now()
);

create table if not exists public.dye_masters (
  id uuid primary key default gen_random_uuid(),
  name text,
  created_at timestamptz default now()
);

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text,
  created_at timestamptz default now()
);

create table if not exists public.consumption_masters (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

create table if not exists public.sales_channels (
  id uuid primary key default gen_random_uuid(),
  name text,
  created_at timestamptz default now()
);

create table if not exists public.stitching_cost_master (
  id uuid primary key default gen_random_uuid(),
  garment_type text,
  category text,
  cost numeric default 0,
  created_at timestamptz default now()
);

create table if not exists public.design_products (
  id uuid primary key default gen_random_uuid(),
  deleted_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.error_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  payload jsonb
);

create table if not exists public.change_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  payload jsonb
);

-- Enable RLS + open authenticated access on stub tables (DEV ONLY)
do $$
declare
  t text;
  pol text;
begin
  foreach t in array array[
    'fabrics','fabric_vendors','dye_masters','product_categories',
    'consumption_masters','sales_channels','stitching_cost_master',
    'design_products','error_logs','change_log'
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

-- ── Seed YOUR admin after creating Auth user ───────────────────────────────
-- Dashboard → Authentication → Users → copy the user's UUID
-- Then uncomment and run:
--
-- insert into public.team_members (user_id, email, name, role, is_active)
-- values (
--   'PASTE_AUTH_USER_UUID_HERE'::uuid,
--   'you@example.com',
--   'Dev Admin',
--   'admin',
--   true
-- )
-- on conflict (user_id) do update
--   set email = excluded.email,
--       name = excluded.name,
--       role = 'admin',
--       is_active = true;
