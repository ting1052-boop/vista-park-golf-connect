alter table public.stores
  add column if not exists agent_round_counting boolean not null default false;

create table if not exists public.agent_rounds (
  agent_device_id uuid not null references public.agent_devices(id) on delete cascade,
  round_id uuid not null,
  store_id uuid not null references public.stores(id) on delete cascade,
  bay_id uuid not null references public.bays(id) on delete cascade,
  revision integer not null check (revision >= 1),
  status text not null check (status in ('open', 'closed')),
  kind text not null check (kind in ('course', 'practice')),
  course_id text,
  started_at timestamptz not null,
  ended_at timestamptz,
  time_basis text not null check (time_basis in ('log', 'observed')),
  end_kind text check (end_kind in ('returned_to_lobby', 'course_changed', 'game_exit', 'log_ended')),
  hole_source text not null check (hole_source in ('none', 'native_log', 'ocr')),
  hole_runs jsonb not null default '[]'::jsonb,
  counted_games smallint not null default 0 check (counted_games between 0 and 6),
  completion text not null check (completion in ('open', 'counted', 'partial', 'unverified', 'practice')),
  start_date date not null,
  play_date date,
  agent_version text not null,
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (agent_device_id, round_id),
  check ((status = 'open' and ended_at is null and end_kind is null and play_date is null and kind = 'course')
      or (status = 'closed' and ended_at is not null and end_kind is not null and play_date is not null)),
  check (ended_at is null or (ended_at >= started_at and ended_at <= started_at + interval '7 days'))
);

create index if not exists agent_rounds_store_start_idx on public.agent_rounds (store_id, start_date);
create index if not exists agent_rounds_store_play_idx on public.agent_rounds (store_id, play_date);
alter table public.agent_rounds enable row level security;
revoke all on public.agent_rounds from anon, authenticated;

create or replace function public.upsert_agent_round(
  p_agent_device_id uuid, p_round_id uuid, p_store_id uuid, p_bay_id uuid,
  p_revision integer, p_status text, p_kind text, p_course_id text,
  p_started_at timestamptz, p_ended_at timestamptz, p_time_basis text,
  p_end_kind text, p_hole_source text, p_hole_runs jsonb,
  p_counted_games smallint, p_completion text, p_agent_version text
) returns text
language plpgsql security definer set search_path = public
as $$
declare
  existing public.agent_rounds%rowtype;
  changed integer;
begin
  select * into existing from public.agent_rounds
    where agent_device_id = p_agent_device_id and round_id = p_round_id for update;

  if found and (existing.revision >= p_revision or (existing.status = 'closed' and p_status = 'open') or
      (existing.hole_source = 'native_log' and p_hole_source <> 'native_log')) then
    return 'already_current';
  end if;

  insert into public.agent_rounds (
    agent_device_id, round_id, store_id, bay_id, revision, status, kind, course_id,
    started_at, ended_at, time_basis, end_kind, hole_source, hole_runs,
    counted_games, completion, start_date, play_date, agent_version
  ) values (
    p_agent_device_id, p_round_id, p_store_id, p_bay_id, p_revision, p_status, p_kind, p_course_id,
    p_started_at, p_ended_at, p_time_basis, p_end_kind, p_hole_source, p_hole_runs,
    p_counted_games, p_completion, (p_started_at at time zone 'Asia/Seoul')::date,
    case when p_ended_at is null then null else (p_ended_at at time zone 'Asia/Seoul')::date end,
    p_agent_version
  )
  on conflict (agent_device_id, round_id) do update set
    revision = excluded.revision, status = excluded.status, kind = excluded.kind,
    course_id = excluded.course_id, started_at = excluded.started_at, ended_at = excluded.ended_at,
    time_basis = excluded.time_basis, end_kind = excluded.end_kind,
    hole_source = excluded.hole_source, hole_runs = excluded.hole_runs,
    counted_games = excluded.counted_games, completion = excluded.completion,
    start_date = excluded.start_date, play_date = excluded.play_date,
    agent_version = excluded.agent_version, received_at = now(), updated_at = now()
  where agent_rounds.revision < excluded.revision
    and not (agent_rounds.status = 'closed' and excluded.status = 'open')
    and not (agent_rounds.hole_source = 'native_log' and excluded.hole_source <> 'native_log');
  get diagnostics changed = row_count;
  return case when changed = 1 then 'stored' else 'already_current' end;
end;
$$;

revoke all on function public.upsert_agent_round(uuid, uuid, uuid, uuid, integer, text, text, text, timestamptz, timestamptz, text, text, text, jsonb, smallint, text, text) from public;
grant execute on function public.upsert_agent_round(uuid, uuid, uuid, uuid, integer, text, text, text, timestamptz, timestamptz, text, text, text, jsonb, smallint, text, text) to service_role;

create or replace function public.agent_round_daily_counts(p_store_id uuid, p_from date, p_to date)
returns table(day date, bay_id uuid, started bigint, counted_games bigint, partial bigint,
  unverified bigint, practice_count bigint, practice_minutes bigint, open_stale bigint)
language sql security definer set search_path = public
as $$
  with starts as (
    select start_date as report_day, r.bay_id,
      count(*) filter (where kind = 'course') started,
      count(*) filter (where kind = 'course' and status = 'open' and started_at < now() - interval '12 hours') open_stale
    from public.agent_rounds r
    where r.store_id = p_store_id and start_date between p_from and p_to
    group by start_date, r.bay_id
  ), finishes as (
    select play_date as report_day, r.bay_id,
      coalesce(sum(counted_games), 0) counted_games,
      count(*) filter (where completion = 'partial') partial,
      count(*) filter (where completion = 'unverified') unverified,
      count(*) filter (where completion = 'practice') practice_count,
      coalesce(sum(case when completion = 'practice' then greatest(1, floor(extract(epoch from (ended_at - started_at)) / 60)) else 0 end), 0) practice_minutes
    from public.agent_rounds r
    where r.store_id = p_store_id and play_date between p_from and p_to
    group by play_date, r.bay_id
  )
  select coalesce(s.report_day, f.report_day), coalesce(s.bay_id, f.bay_id),
    coalesce(s.started, 0), coalesce(f.counted_games, 0), coalesce(f.partial, 0),
    coalesce(f.unverified, 0), coalesce(f.practice_count, 0), coalesce(f.practice_minutes, 0),
    coalesce(s.open_stale, 0)
  from starts s full join finishes f on f.report_day = s.report_day and f.bay_id = s.bay_id
  where p_to >= p_from and p_to - p_from <= 92;
$$;

revoke all on function public.agent_round_daily_counts(uuid, date, date) from public;
grant execute on function public.agent_round_daily_counts(uuid, date, date) to service_role;

create or replace function public.agent_round_pending(p_store_id uuid)
returns table(bay_id uuid, pending_count bigint, oldest_pending_date date)
language sql security definer set search_path = public
as $$
  select r.bay_id, count(*), min(coalesce(r.play_date, r.start_date))
  from public.agent_rounds r
  where r.store_id = p_store_id
    and r.start_date >= (now() at time zone 'Asia/Seoul')::date - 30
    and (r.completion = 'unverified' or (r.status = 'open' and r.started_at < now() - interval '12 hours'))
  group by r.bay_id;
$$;

revoke all on function public.agent_round_pending(uuid) from public;
grant execute on function public.agent_round_pending(uuid) to service_role;
