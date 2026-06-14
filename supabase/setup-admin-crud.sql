-- VISTA Park Golf Connect
-- Enable real Supabase CRUD for Stores, Bays, and Reservations screens.
-- Run this after setup-core.sql and setup-seed.sql.

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  bay_id uuid references public.bays(id) on delete set null,
  guest_name text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  party_size integer not null default 1,
  channel text not null default 'admin',
  status text not null default 'requested',
  approval_required boolean not null default false,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservations_time_check check (ends_at > starts_at),
  constraint reservations_party_size_check check (party_size between 1 and 12),
  constraint reservations_channel_check check (channel in ('member_app', 'phone', 'walk_in', 'admin')),
  constraint reservations_status_check check (status in ('requested', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show'))
);

create index if not exists reservations_store_time_idx on public.reservations(store_id, starts_at, status);
create index if not exists reservations_bay_time_idx on public.reservations(bay_id, starts_at);

alter table public.reservations enable row level security;

drop policy if exists stores_insert_public_demo on public.stores;
create policy stores_insert_public_demo on public.stores
  for insert with check (true);

drop policy if exists stores_update_public_demo on public.stores;
create policy stores_update_public_demo on public.stores
  for update using (true)
  with check (true);

drop policy if exists stores_delete_public_demo on public.stores;
create policy stores_delete_public_demo on public.stores
  for delete using (true);

drop policy if exists bays_insert_public_demo on public.bays;
create policy bays_insert_public_demo on public.bays
  for insert with check (true);

drop policy if exists bays_delete_public_demo on public.bays;
create policy bays_delete_public_demo on public.bays
  for delete using (true);

drop policy if exists reservations_select_public_demo on public.reservations;
create policy reservations_select_public_demo on public.reservations
  for select using (true);

drop policy if exists reservations_insert_public_demo on public.reservations;
create policy reservations_insert_public_demo on public.reservations
  for insert with check (true);

drop policy if exists reservations_update_public_demo on public.reservations;
create policy reservations_update_public_demo on public.reservations
  for update using (true)
  with check (true);

drop policy if exists reservations_delete_public_demo on public.reservations;
create policy reservations_delete_public_demo on public.reservations
  for delete using (true);

insert into public.reservations (
  id,
  store_id,
  bay_id,
  guest_name,
  starts_at,
  ends_at,
  party_size,
  channel,
  status,
  approval_required,
  memo
)
values
  (
    '9a111111-0001-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-0001-4000-8000-000000000001',
    '서진 / 010-****-2001',
    '2026-06-14 09:30:00+09',
    '2026-06-14 10:30:00+09',
    2,
    'member_app',
    'checked_in',
    false,
    '회원 앱 예약'
  ),
  (
    '9a111111-0002-4000-8000-000000000002',
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-0002-4000-8000-000000000002',
    '도윤 / 010-****-2002',
    '2026-06-14 10:00:00+09',
    '2026-06-14 11:00:00+09',
    1,
    'phone',
    'confirmed',
    true,
    '전화 예약'
  )
on conflict (id) do update set
  bay_id = excluded.bay_id,
  guest_name = excluded.guest_name,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  party_size = excluded.party_size,
  channel = excluded.channel,
  status = excluded.status,
  approval_required = excluded.approval_required,
  memo = excluded.memo,
  updated_at = now();

notify pgrst, 'reload schema';
