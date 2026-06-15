-- VISTA Park Golf Connect
-- Minimal Supabase setup for the first dashboard connection test.
-- Run this first in Supabase SQL Editor.

create extension if not exists "pgcrypto";

do $$
begin
  create type public.bay_status as enum ('available', 'in_use', 'waiting', 'maintenance');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  operator_name text not null default 'HH Square',
  address text,
  phone text,
  bay_count integer not null default 0 check (bay_count between 0 and 99),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bays (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  bay_code text not null,
  display_name text not null,
  status public.bay_status not null default 'available',
  memo text,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, bay_code)
);

create table if not exists public.device_logs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete set null,
  bay_id uuid references public.bays(id) on delete set null,
  device_type text not null,
  action text not null,
  status text not null,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  constraint device_logs_action_check check (action in ('ON', 'OFF')),
  constraint device_logs_device_type_check check (device_type in ('projector', 'ac', 'kiosk', 'lighting')),
  constraint device_logs_status_check check (status in ('success', 'failed'))
);

create index if not exists bays_store_status_idx on public.bays(store_id, status);
create index if not exists device_logs_store_created_idx on public.device_logs(store_id, created_at desc);
create index if not exists device_logs_bay_created_idx on public.device_logs(bay_id, created_at desc);

alter table public.stores enable row level security;
alter table public.bays enable row level security;
alter table public.device_logs enable row level security;

drop policy if exists stores_select_public_demo on public.stores;
create policy stores_select_public_demo on public.stores
  for select using (true);

drop policy if exists bays_select_public_demo on public.bays;
create policy bays_select_public_demo on public.bays
  for select using (true);

drop policy if exists bays_update_public_demo on public.bays;
create policy bays_update_public_demo on public.bays
  for update using (true)
  with check (true);

drop policy if exists device_logs_select_public_demo on public.device_logs;
create policy device_logs_select_public_demo on public.device_logs
  for select using (true);

-- Service role bypasses RLS, but this policy keeps local MVP testing simple
-- if you later insert device logs with an authenticated staff account.
drop policy if exists device_logs_insert_public_demo on public.device_logs;
create policy device_logs_insert_public_demo on public.device_logs
  for insert with check (true);

notify pgrst, 'reload schema';
