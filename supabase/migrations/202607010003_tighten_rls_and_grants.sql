-- VISTA Park Golf Connect
-- Lock down anonymous access for the MVP.
--
-- Run after creating at least one admin account in Supabase Auth.
-- This migration is defensive because early demo databases may not have every
-- table yet, and older reservations tables may be missing newer guest columns.

-- 0) Bring older reservations tables up to the column shape required by the app.
do $$
begin
  if to_regclass('public.reservations') is not null then
    alter table public.reservations
      add column if not exists guest_name text;

    alter table public.reservations
      add column if not exists guest_phone_last4 char(4);

    alter table public.reservations
      add column if not exists approval_required boolean not null default false;

    alter table public.reservations
      add column if not exists automation_prepare_status text not null default 'pending';

    alter table public.reservations
      add column if not exists automation_prepared_at timestamptz;
  end if;
end $$;

-- 1) Drop every existing policy on the tables in scope so the result does not
-- depend on which setup SQL files were applied before.
do $$
declare
  pol record;
begin
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('stores', 'bays', 'devices', 'members', 'reservations')
  loop
    execute format('drop policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  end loop;
end $$;

-- 2) Enable RLS only on tables that exist in this database.
do $$
begin
  if to_regclass('public.stores') is not null then
    execute 'alter table public.stores enable row level security';
  end if;

  if to_regclass('public.bays') is not null then
    execute 'alter table public.bays enable row level security';
  end if;

  if to_regclass('public.devices') is not null then
    execute 'alter table public.devices enable row level security';
  end if;

  if to_regclass('public.members') is not null then
    execute 'alter table public.members enable row level security';
  end if;

  if to_regclass('public.reservations') is not null then
    execute 'alter table public.reservations enable row level security';
  end if;
end $$;

-- 3) stores / bays: everyone may read, only signed-in staff may write.
do $$
begin
  if to_regclass('public.stores') is not null then
    execute 'create policy stores_select_all on public.stores for select using (true)';
    execute 'create policy stores_manage_staff on public.stores for all to authenticated using (true) with check (true)';
    execute 'revoke insert, update, delete on public.stores from anon';
  end if;

  if to_regclass('public.bays') is not null then
    execute 'create policy bays_select_all on public.bays for select using (true)';
    execute 'create policy bays_manage_staff on public.bays for all to authenticated using (true) with check (true)';
    execute 'revoke insert, update, delete on public.bays from anon';
  end if;
end $$;

-- 4) devices / members: staff only. Some demo databases do not have devices yet.
do $$
begin
  if to_regclass('public.devices') is not null then
    execute 'create policy devices_manage_staff on public.devices for all to authenticated using (true) with check (true)';
    execute 'revoke all on public.devices from anon';
  end if;

  if to_regclass('public.members') is not null then
    execute 'create policy members_manage_staff on public.members for all to authenticated using (true) with check (true)';
    execute 'revoke all on public.members from anon';
  end if;
end $$;

-- 5) reservations:
--    anon may create member_app reservations and read availability columns only.
do $$
begin
  if to_regclass('public.reservations') is not null then
    execute 'create policy reservations_select_all on public.reservations for select using (true)';

    execute $policy$
      create policy reservations_insert_public on public.reservations
        for insert to anon
        with check (
          channel = 'member_app'
          and status in ('requested', 'confirmed')
          and guest_name is not null
        )
    $policy$;

    execute 'create policy reservations_manage_staff on public.reservations for all to authenticated using (true) with check (true)';

    execute 'revoke all on public.reservations from anon';

    execute $grant$
      grant select (
        id,
        store_id,
        bay_id,
        starts_at,
        ends_at,
        party_size,
        channel,
        status,
        approval_required,
        created_at
      ) on public.reservations to anon
    $grant$;

    execute $grant$
      grant insert (
        store_id,
        bay_id,
        guest_name,
        guest_phone_last4,
        starts_at,
        ends_at,
        party_size,
        channel,
        status,
        approval_required,
        memo
      ) on public.reservations to anon
    $grant$;
  end if;
end $$;
