create table if not exists public.agent_usage_events (
  event_id uuid primary key,
  agent_device_id uuid not null references public.agent_devices(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  bay_id uuid not null references public.bays(id) on delete cascade,
  usage_id uuid not null,
  event_type text not null check (event_type in ('usage_started', 'usage_ended')),
  source text not null check (source in ('foreground_input', 'park_log')),
  confidence text not null check (confidence in ('unknown', 'low', 'medium', 'high')),
  occurred_at timestamptz not null,
  started_at timestamptz not null,
  ends_at timestamptz not null,
  end_reason text check (end_reason is null or end_reason in ('duration_elapsed', 'process_exit')),
  agent_version text not null,
  received_at timestamptz not null default now(),
  unique (agent_device_id, usage_id, event_type),
  check (ends_at = started_at + interval '60 minutes'),
  check ((event_type = 'usage_started' and end_reason is null) or (event_type = 'usage_ended' and end_reason is not null)),
  check (occurred_at >= started_at)
);

create index if not exists agent_usage_events_store_occurred_idx
  on public.agent_usage_events (store_id, occurred_at desc)
  where event_type = 'usage_started';

create index if not exists agent_usage_events_bay_occurred_idx
  on public.agent_usage_events (bay_id, occurred_at desc);

alter table public.agent_usage_events enable row level security;
revoke all on public.agent_usage_events from anon, authenticated;
