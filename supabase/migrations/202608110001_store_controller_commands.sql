-- Store-local controller command queue.
-- Apply in Supabase SQL Editor only after the Vercel deployment and local
-- controller package have been reviewed.

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'store_controller_command_status'
  ) then
    create type public.store_controller_command_status as enum (
      'pending', 'processing', 'succeeded', 'failed', 'cancelled'
    );
  end if;
end $$;

create table if not exists public.store_controller_commands (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  bay_id uuid references public.bays(id) on delete set null,
  access_session_id uuid references public.access_sessions(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete set null,
  command_type text not null,
  status public.store_controller_command_status not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  error_message text,
  attempts integer not null default 0,
  controller_id text,
  lease_expires_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_controller_commands_type_check check (command_type in ('prepare_bay')),
  constraint store_controller_commands_attempts_check check (attempts between 0 and 20),
  unique (access_session_id, command_type)
);

create index if not exists store_controller_commands_pending_idx
  on public.store_controller_commands (status, created_at)
  where status in ('pending', 'processing');

alter table public.store_controller_commands enable row level security;

drop trigger if exists store_controller_commands_set_updated_at on public.store_controller_commands;
create trigger store_controller_commands_set_updated_at
  before update on public.store_controller_commands
  for each row execute function public.set_updated_at();
