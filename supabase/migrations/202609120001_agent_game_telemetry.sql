-- Optional, observation-only golf program state reported by the Windows Agent.
-- This data never drives reservations, billing, session closeout, or equipment control.

alter table public.agent_devices
  add column if not exists game_telemetry jsonb,
  add column if not exists game_telemetry_received_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'agent_devices_game_telemetry_object_check'
      and conrelid = 'public.agent_devices'::regclass
  ) then
    alter table public.agent_devices
      add constraint agent_devices_game_telemetry_object_check
      check (game_telemetry is null or jsonb_typeof(game_telemetry) = 'object');
  end if;
end
$$;

comment on column public.agent_devices.game_telemetry is
  'Latest sanitized, observation-only golf program state from the bay Agent.';
comment on column public.agent_devices.game_telemetry_received_at is
  'Server receipt time for game_telemetry; observedAt remains the device observation time.';
