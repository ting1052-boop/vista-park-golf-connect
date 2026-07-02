-- VISTA Park Golf Connect
-- Store-level extension policy and bay session extension request ledger.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.access_sessions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete set null,
  bay_id uuid references public.bays(id) on delete set null,
  guest_name text,
  party_size integer not null default 1,
  status text not null default 'pending',
  started_at timestamptz,
  ends_at timestamptz,
  completed_at timestamptz,
  entry_method text not null default 'kiosk',
  entry_code_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint access_sessions_party_size_check check (party_size between 1 and 12),
  constraint access_sessions_status_check check (status in ('pending', 'active', 'extended', 'completed', 'cancelled', 'overdue')),
  constraint access_sessions_time_check check (ends_at is null or started_at is null or ends_at > started_at)
);

create table if not exists public.kiosk_sessions (
  id uuid primary key default gen_random_uuid(),
  access_session_id uuid not null references public.access_sessions(id) on delete cascade,
  allowed_minutes integer not null,
  remaining_seconds integer not null default 0,
  is_locked boolean not null default false,
  locked_at timestamptz,
  extended_minutes integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kiosk_sessions_allowed_minutes_check check (allowed_minutes between 1 and 720),
  constraint kiosk_sessions_remaining_seconds_check check (remaining_seconds >= 0)
);

create table if not exists public.store_settings (
  store_id uuid primary key references public.stores(id) on delete cascade,
  extension_mode text not null default 'auto',
  extension_minutes integer not null default 30,
  extension_notice_minutes integer not null default 10,
  extension_deadline_minutes integer,
  extension_buffer_minutes integer not null default 10,
  extension_price integer not null default 6000,
  conflict_policy text not null default 'partial',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_settings_extension_mode_check check (extension_mode in ('auto', 'manual')),
  constraint store_settings_extension_minutes_check check (extension_minutes between 5 and 240),
  constraint store_settings_extension_notice_minutes_check check (extension_notice_minutes between 1 and 120),
  constraint store_settings_extension_deadline_minutes_check check (
    extension_deadline_minutes is null or extension_deadline_minutes between 0 and 120
  ),
  constraint store_settings_extension_buffer_minutes_check check (extension_buffer_minutes between 0 and 240),
  constraint store_settings_extension_price_check check (extension_price >= 0),
  constraint store_settings_conflict_policy_check check (conflict_policy in ('reject', 'partial', 'manual_review'))
);

create table if not exists public.extension_requests (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  access_session_id uuid not null references public.access_sessions(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete set null,
  bay_id uuid references public.bays(id) on delete set null,
  requested_minutes integer not null default 30,
  approved_minutes integer,
  status text not null default 'requested',
  decision_source text,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by_user_id uuid,
  requested_ends_at timestamptz,
  approved_ends_at timestamptz,
  price_amount integer not null default 0,
  price_currency text not null default 'KRW',
  conflict_policy text not null default 'partial',
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint extension_requests_requested_minutes_check check (requested_minutes between 1 and 240),
  constraint extension_requests_approved_minutes_check check (
    approved_minutes is null or approved_minutes between 0 and 240
  ),
  constraint extension_requests_status_check check (status in ('requested', 'approved', 'rejected', 'expired')),
  constraint extension_requests_decision_source_check check (
    decision_source is null or decision_source in ('auto', 'manual', 'system')
  ),
  constraint extension_requests_price_amount_check check (price_amount >= 0),
  constraint extension_requests_conflict_policy_check check (conflict_policy in ('reject', 'partial', 'manual_review')),
  constraint extension_requests_decision_check check (
    (status = 'requested' and decided_at is null)
    or (status <> 'requested' and decided_at is not null)
  )
);

create table if not exists public.agent_devices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  bay_id uuid not null references public.bays(id) on delete cascade,
  label text not null default 'VISTA Bay Agent',
  token_hash text not null unique,
  is_active boolean not null default true,
  last_seen_at timestamptz,
  agent_version text,
  pc_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bay_id)
);

create index if not exists access_sessions_store_status_idx
  on public.access_sessions(store_id, status, started_at desc);

create index if not exists access_sessions_reservation_idx
  on public.access_sessions(reservation_id);

create index if not exists kiosk_sessions_access_idx
  on public.kiosk_sessions(access_session_id);

create index if not exists extension_requests_store_status_idx
  on public.extension_requests(store_id, status, requested_at desc);

create index if not exists extension_requests_session_idx
  on public.extension_requests(access_session_id, requested_at desc);

create index if not exists extension_requests_bay_status_idx
  on public.extension_requests(bay_id, status, requested_at desc);

create index if not exists agent_devices_store_active_idx
  on public.agent_devices(store_id, is_active, last_seen_at desc);

drop trigger if exists store_settings_set_updated_at on public.store_settings;
create trigger store_settings_set_updated_at before update on public.store_settings
  for each row execute function public.set_updated_at();

drop trigger if exists access_sessions_set_updated_at on public.access_sessions;
create trigger access_sessions_set_updated_at before update on public.access_sessions
  for each row execute function public.set_updated_at();

drop trigger if exists kiosk_sessions_set_updated_at on public.kiosk_sessions;
create trigger kiosk_sessions_set_updated_at before update on public.kiosk_sessions
  for each row execute function public.set_updated_at();

drop trigger if exists extension_requests_set_updated_at on public.extension_requests;
create trigger extension_requests_set_updated_at before update on public.extension_requests
  for each row execute function public.set_updated_at();

drop trigger if exists agent_devices_set_updated_at on public.agent_devices;
create trigger agent_devices_set_updated_at before update on public.agent_devices
  for each row execute function public.set_updated_at();

insert into public.store_settings (store_id)
select id from public.stores
on conflict (store_id) do nothing;

alter table public.store_settings enable row level security;
alter table public.access_sessions enable row level security;
alter table public.kiosk_sessions enable row level security;
alter table public.extension_requests enable row level security;
alter table public.agent_devices enable row level security;

drop policy if exists access_sessions_select_staff on public.access_sessions;
create policy access_sessions_select_staff on public.access_sessions
  for select to authenticated using (true);

drop policy if exists access_sessions_manage_staff on public.access_sessions;
create policy access_sessions_manage_staff on public.access_sessions
  for all to authenticated using (true) with check (true);

drop policy if exists kiosk_sessions_select_staff on public.kiosk_sessions;
create policy kiosk_sessions_select_staff on public.kiosk_sessions
  for select to authenticated using (true);

drop policy if exists kiosk_sessions_manage_staff on public.kiosk_sessions;
create policy kiosk_sessions_manage_staff on public.kiosk_sessions
  for all to authenticated using (true) with check (true);

drop policy if exists store_settings_select_staff on public.store_settings;
create policy store_settings_select_staff on public.store_settings
  for select to authenticated using (true);

drop policy if exists store_settings_manage_manager on public.store_settings;
create policy store_settings_manage_manager on public.store_settings
  for all to authenticated using (true) with check (true);

drop policy if exists extension_requests_select_staff on public.extension_requests;
create policy extension_requests_select_staff on public.extension_requests
  for select to authenticated using (true);

drop policy if exists extension_requests_manage_staff on public.extension_requests;
create policy extension_requests_manage_staff on public.extension_requests
  for all to authenticated using (true) with check (true);

drop policy if exists agent_devices_select_staff on public.agent_devices;
create policy agent_devices_select_staff on public.agent_devices
  for select to authenticated using (true);

drop policy if exists agent_devices_manage_manager on public.agent_devices;
create policy agent_devices_manage_manager on public.agent_devices
  for all to authenticated using (true) with check (true);
