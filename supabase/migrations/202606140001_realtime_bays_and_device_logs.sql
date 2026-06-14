-- VISTA Park Golf Connect
-- Add dashboard realtime bay status and device control logs to an existing Supabase DB.

alter type public.bay_status add value if not exists 'waiting';

update public.bays
set status = 'waiting'
where status::text = 'cleaning';

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

create index if not exists device_logs_store_created_idx on public.device_logs(store_id, created_at desc);
create index if not exists device_logs_bay_created_idx on public.device_logs(bay_id, created_at desc);

alter table public.device_logs enable row level security;

drop policy if exists device_logs_select_staff on public.device_logs;
create policy device_logs_select_staff on public.device_logs
  for select using (
    store_id is not null
    and public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[])
  );

drop policy if exists device_logs_insert_staff on public.device_logs;
create policy device_logs_insert_staff on public.device_logs
  for insert with check (
    store_id is not null
    and public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[])
  );
