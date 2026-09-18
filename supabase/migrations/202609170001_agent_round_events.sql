create table if not exists public.agent_round_events (
  event_id uuid primary key,
  agent_device_id uuid not null references public.agent_devices(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  bay_id uuid not null references public.bays(id) on delete cascade,
  round_id uuid not null,
  event_type text not null check (event_type = 'returned_to_lobby'),
  course_id text,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  last_known_hole integer check (last_known_hole between 1 and 18),
  last_known_hole_at timestamptz,
  completion_kind text not null default 'unverified' check (completion_kind = 'unverified'),
  source text not null default 'log' check (source = 'log'),
  agent_version text not null,
  unique (agent_device_id, round_id, event_type)
);

create index if not exists agent_round_events_store_occurred_idx
  on public.agent_round_events (store_id, occurred_at desc);
create index if not exists agent_round_events_bay_occurred_idx
  on public.agent_round_events (bay_id, occurred_at desc);

alter table public.agent_round_events enable row level security;
revoke all on public.agent_round_events from anon, authenticated;

create or replace function public.store_agent_game_telemetry_if_newer(
  p_agent_device_id uuid,
  p_telemetry jsonb,
  p_received_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_payload jsonb;
  current_monitor text;
  incoming_monitor text;
  current_sequence bigint;
  incoming_sequence bigint;
  current_observed timestamptz;
  incoming_observed timestamptz;
begin
  select game_telemetry into current_payload
  from public.agent_devices
  where id = p_agent_device_id
  for update;

  if not found then return false; end if;

  current_monitor := current_payload->>'monitorInstanceId';
  incoming_monitor := p_telemetry->>'monitorInstanceId';
  current_sequence := coalesce((current_payload->>'sampleSequence')::bigint, -1);
  incoming_sequence := coalesce((p_telemetry->>'sampleSequence')::bigint, -1);
  current_observed := nullif(current_payload->>'observedAt', '')::timestamptz;
  incoming_observed := nullif(p_telemetry->>'observedAt', '')::timestamptz;

  if current_payload is not null and (
    (current_monitor = incoming_monitor and incoming_sequence <= current_sequence) or
    (current_monitor is distinct from incoming_monitor and incoming_observed <= current_observed)
  ) then
    return false;
  end if;

  update public.agent_devices
  set game_telemetry = p_telemetry,
      game_telemetry_received_at = p_received_at,
      updated_at = now()
  where id = p_agent_device_id;
  return true;
end;
$$;

revoke all on function public.store_agent_game_telemetry_if_newer(uuid, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.store_agent_game_telemetry_if_newer(uuid, jsonb, timestamptz) to service_role;
