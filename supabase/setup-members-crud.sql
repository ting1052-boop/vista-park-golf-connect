-- VISTA Park Golf Connect
-- Enable real Supabase CRUD for the Members screen.
-- Run this after setup-core.sql.

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  primary_store_id uuid not null references public.stores(id) on delete restrict,
  nickname text not null,
  phone_last4 char(4),
  login_provider text not null default 'manual',
  age_group text,
  memo text,
  is_guest boolean not null default false,
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint members_login_provider_check check (login_provider in ('kakao', 'naver', 'phone', 'manual')),
  constraint members_phone_last4_check check (phone_last4 is null or phone_last4 ~ '^[0-9]{4}$')
);

alter table public.members drop constraint if exists members_age_group_check;

create index if not exists members_store_nickname_idx on public.members(primary_store_id, nickname);

alter table public.members enable row level security;

drop policy if exists members_select_public_demo on public.members;
create policy members_select_public_demo on public.members
  for select using (true);

drop policy if exists members_insert_public_demo on public.members;
create policy members_insert_public_demo on public.members
  for insert with check (true);

drop policy if exists members_update_public_demo on public.members;
create policy members_update_public_demo on public.members
  for update using (true)
  with check (true);

drop policy if exists members_delete_public_demo on public.members;
create policy members_delete_public_demo on public.members
  for delete using (true);

notify pgrst, 'reload schema';
