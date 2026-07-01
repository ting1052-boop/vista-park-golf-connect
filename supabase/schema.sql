-- VISTA Park Golf Connect
-- Supabase PostgreSQL schema and Row Level Security draft.
-- Purpose: HH Square self-owned web operation program documentation.

create extension if not exists "pgcrypto";
-- Needed so the reservations exclusion constraint below can index bay_id
-- equality (=) alongside the tstzrange overlap (&&) operator in a GiST index.
create extension if not exists "btree_gist";

create type public.app_role as enum ('head_admin', 'store_manager', 'staff', 'member');
create type public.store_status as enum ('active', 'paused', 'closed');
create type public.bay_status as enum ('available', 'in_use', 'waiting', 'maintenance');
create type public.reservation_status as enum ('requested', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show');
create type public.reservation_channel as enum ('member_app', 'phone', 'walk_in', 'admin');
create type public.device_status as enum ('available', 'rented', 'repair', 'retired');
create type public.game_status as enum ('ready', 'playing', 'completed', 'cancelled');
create type public.player_type as enum ('member', 'guest');
create type public.tournament_status as enum ('draft', 'open', 'playing', 'completed', 'cancelled');
create type public.join_post_status as enum ('open', 'closed', 'cancelled');
create type public.join_application_status as enum ('requested', 'approved', 'rejected', 'cancelled');
create type public.report_type as enum ('game_result', 'tournament_result');
create type public.report_format as enum ('html');
create type public.automation_provider as enum ('hejhome', 'tapo', 'smartthings', 'ifttt', 'home_assistant', 'matter', 'webhook', 'manual');
create type public.automation_device_type as enum ('light', 'kiosk', 'hvac', 'smart_plug', 'screen_equipment', 'router', 'etc');
create type public.automation_device_state as enum ('unknown', 'online', 'offline', 'on', 'off', 'standby', 'error');
create type public.automation_scene_type as enum ('reservation_prepare', 'session_start', 'session_end', 'closing', 'emergency_stop');
create type public.automation_log_status as enum ('requested', 'success', 'failed', 'skipped');
create type public.access_session_status as enum ('pending', 'active', 'extended', 'completed', 'cancelled', 'overdue');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role public.app_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  operator_name text not null default 'HH Square',
  business_number text,
  address text,
  phone text,
  bay_count integer not null default 0 check (bay_count between 0 and 99),
  status public.store_status not null default 'active',
  opened_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.store_users (
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role public.app_role not null,
  assigned_at timestamptz not null default now(),
  primary key (store_id, user_id),
  constraint store_users_role_check check (role in ('store_manager', 'staff'))
);

create table public.bays (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  bay_code text not null,
  display_name text not null,
  status public.bay_status not null default 'available',
  memo text,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, bay_code)
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  device_code text not null,
  name text not null,
  device_type text not null,
  status public.device_status not null default 'available',
  purchased_on date,
  last_serviced_on date,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, device_code)
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  primary_store_id uuid not null references public.stores(id) on delete restrict,
  auth_user_id uuid references public.users(id) on delete set null,
  nickname text not null,
  login_provider text,
  provider_subject text,
  phone_hash text,
  phone_last4 char(4),
  age_group text,
  is_guest boolean not null default false,
  memo text,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (primary_store_id, phone_hash),
  unique (login_provider, provider_subject),
  constraint members_login_provider_check check (
    login_provider is null or login_provider in ('kakao', 'naver', 'phone', 'manual')
  ),
  constraint members_age_group_check check (
    age_group is null or age_group in ('40대 이하', '50대', '60대', '70대', '80대 이상')
  ),
  constraint members_phone_for_registered_check check (
    is_guest = true or (phone_hash is not null and phone_last4 is not null)
  )
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  bay_id uuid references public.bays(id) on delete set null,
  member_id uuid references public.members(id) on delete set null,
  guest_name text,
  guest_phone_last4 char(4),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  party_size integer not null default 1,
  channel public.reservation_channel not null default 'admin',
  status public.reservation_status not null default 'requested',
  memo text,
  cancel_reason text,
  no_show_reason text,
  approval_required boolean not null default false,
  automation_prepare_status text not null default 'pending',
  automation_prepared_at timestamptz,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservations_time_check check (ends_at > starts_at),
  constraint reservations_party_size_check check (party_size between 1 and 8),
  constraint reservations_member_or_guest_check check (member_id is not null or guest_name is not null),
  constraint reservations_automation_prepare_status_check check (automation_prepare_status in ('pending', 'success', 'failed', 'skipped')),
  -- Blocks two active (not cancelled/no_show) reservations from overlapping
  -- on the same bay. See supabase/migrations/202607010001_reservations_bay_time_exclusion.sql
  -- for the migration that adds this to an already-deployed database.
  constraint reservations_bay_time_excl exclude using gist (
    bay_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (bay_id is not null and status not in ('cancelled', 'no_show'))
);

create table public.business_hours (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  day_of_week integer not null,
  open_time time,
  close_time time,
  is_closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, day_of_week),
  constraint business_hours_day_check check (day_of_week between 0 and 6),
  constraint business_hours_time_check check (is_closed = true or (open_time is not null and close_time is not null and close_time > open_time))
);

create table public.no_show_logs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id) on delete set null,
  store_id uuid not null references public.stores(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete set null,
  reason text,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.store_notices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  title text not null,
  content text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.future_game_scores (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id) on delete set null,
  store_id uuid not null references public.stores(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete set null,
  external_game_id text,
  score_data jsonb,
  played_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.automation_devices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  bay_id uuid references public.bays(id) on delete set null,
  provider public.automation_provider not null default 'manual',
  device_type public.automation_device_type not null,
  display_name text not null,
  external_device_id text,
  webhook_url text,
  state public.automation_device_state not null default 'unknown',
  is_safety_critical boolean not null default false,
  is_enabled boolean not null default true,
  last_seen_at timestamptz,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, provider, external_device_id)
);

create table public.automation_scenes (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  scene_type public.automation_scene_type not null,
  trigger_offset_minutes integer not null default 0,
  is_enabled boolean not null default true,
  requires_manual_confirm boolean not null default false,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.automation_scene_steps (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.automation_scenes(id) on delete cascade,
  device_id uuid not null references public.automation_devices(id) on delete cascade,
  step_order integer not null default 1,
  command text not null,
  command_payload jsonb not null default '{}'::jsonb,
  delay_seconds integer not null default 0,
  created_at timestamptz not null default now(),
  unique (scene_id, step_order),
  constraint automation_scene_steps_order_check check (step_order between 1 and 50),
  constraint automation_scene_steps_delay_check check (delay_seconds between 0 and 3600)
);

create table public.access_sessions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete set null,
  member_id uuid references public.members(id) on delete set null,
  bay_id uuid references public.bays(id) on delete set null,
  guest_name text,
  party_size integer not null default 1,
  status public.access_session_status not null default 'pending',
  started_at timestamptz,
  ends_at timestamptz,
  completed_at timestamptz,
  entry_method text not null default 'kiosk',
  entry_code_hash text,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint access_sessions_party_size_check check (party_size between 1 and 12),
  constraint access_sessions_time_check check (ends_at is null or started_at is null or ends_at > started_at)
);

create table public.kiosk_sessions (
  id uuid primary key default gen_random_uuid(),
  access_session_id uuid not null references public.access_sessions(id) on delete cascade,
  kiosk_device_id uuid references public.automation_devices(id) on delete set null,
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

create table public.automation_logs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  device_id uuid references public.automation_devices(id) on delete set null,
  scene_id uuid references public.automation_scenes(id) on delete set null,
  access_session_id uuid references public.access_sessions(id) on delete set null,
  reservation_id uuid references public.reservations(id) on delete set null,
  requested_by_user_id uuid references public.users(id) on delete set null,
  event_name text not null,
  command text,
  status public.automation_log_status not null default 'requested',
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create table public.device_logs (
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

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  name text not null,
  hole_count integer not null default 18,
  par_total integer not null default 54,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint courses_hole_count_check check (hole_count between 1 and 18),
  constraint courses_par_total_check check (par_total between 18 and 108)
);

create table public.course_holes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  hole_no integer not null,
  par integer not null default 3,
  distance_meter integer,
  created_at timestamptz not null default now(),
  unique (course_id, hole_no),
  constraint course_holes_hole_no_check check (hole_no between 1 and 18),
  constraint course_holes_par_check check (par between 2 and 6),
  constraint course_holes_distance_check check (distance_meter is null or distance_meter > 0)
);

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  course_id uuid references public.courses(id) on delete set null,
  title text not null,
  description text,
  status public.tournament_status not null default 'draft',
  starts_at timestamptz not null,
  ends_at timestamptz,
  max_participants integer,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tournaments_capacity_check check (max_participants is null or max_participants > 0)
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  bay_id uuid references public.bays(id) on delete set null,
  course_id uuid references public.courses(id) on delete set null,
  tournament_id uuid references public.tournaments(id) on delete set null,
  title text not null default '일반 경기',
  status public.game_status not null default 'ready',
  created_by_user_id uuid references public.users(id) on delete set null,
  created_via text not null default 'admin',
  guest_game boolean not null default false,
  started_at timestamptz,
  completed_at timestamptz,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint games_created_via_check check (created_via in ('admin', 'kiosk'))
);

create table public.game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  member_id uuid references public.members(id) on delete restrict,
  player_type public.player_type not null default 'member',
  guest_nickname text,
  player_order integer not null default 1,
  total_strokes integer not null default 0,
  score_to_par integer not null default 0,
  rank_in_game integer,
  created_at timestamptz not null default now(),
  unique (game_id, member_id),
  unique (game_id, player_order),
  constraint game_players_order_check check (player_order between 1 and 8),
  constraint game_players_member_or_guest_check check (
    (player_type = 'member' and member_id is not null)
    or (player_type = 'guest' and member_id is null and guest_nickname is not null)
  )
);

create table public.scores (
  id uuid primary key default gen_random_uuid(),
  game_player_id uuid not null references public.game_players(id) on delete cascade,
  hole_no integer not null,
  par integer not null default 3,
  strokes integer not null,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_player_id, hole_no),
  constraint scores_hole_no_check check (hole_no between 1 and 18),
  constraint scores_par_check check (par between 2 and 6),
  constraint scores_strokes_check check (strokes between 1 and 20)
);

create table public.rankings (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  ranking_month date not null,
  best_score integer not null,
  round_count integer not null default 1,
  rank_no integer not null,
  calculated_at timestamptz not null default now(),
  unique (store_id, member_id, ranking_month)
);

create table public.tournament_entries (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete restrict,
  seed_no integer,
  registered_by_user_id uuid references public.users(id) on delete set null,
  registered_at timestamptz not null default now(),
  unique (tournament_id, member_id)
);

create table public.join_posts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  author_user_id uuid references public.users(id) on delete set null,
  author_member_id uuid references public.members(id) on delete set null,
  title text not null,
  content text,
  preferred_at timestamptz not null,
  max_people integer not null default 4,
  status public.join_post_status not null default 'open',
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint join_posts_people_check check (max_people between 2 and 8)
);

create table public.join_applications (
  id uuid primary key default gen_random_uuid(),
  join_post_id uuid not null references public.join_posts(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  status public.join_application_status not null default 'requested',
  message text,
  applied_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (join_post_id, member_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  game_id uuid references public.games(id) on delete cascade,
  tournament_id uuid references public.tournaments(id) on delete cascade,
  requested_by_user_id uuid references public.users(id) on delete set null,
  report_type public.report_type not null,
  format public.report_format not null default 'html',
  title text not null,
  html_snapshot text not null,
  created_at timestamptz not null default now(),
  constraint reports_target_check check (
    (report_type = 'game_result' and game_id is not null and tournament_id is null)
    or (report_type = 'tournament_result' and tournament_id is not null and game_id is null)
  )
);

create index store_users_user_id_idx on public.store_users(user_id);
create index bays_store_status_idx on public.bays(store_id, status);
create index reservations_store_time_idx on public.reservations(store_id, starts_at, status);
create index reservations_member_time_idx on public.reservations(member_id, starts_at desc);
create index business_hours_store_day_idx on public.business_hours(store_id, day_of_week);
create index no_show_logs_member_store_idx on public.no_show_logs(member_id, store_id, created_at desc);
create index store_notices_store_active_idx on public.store_notices(store_id, is_active, created_at desc);
create index future_game_scores_reservation_idx on public.future_game_scores(reservation_id);
create index automation_devices_store_type_idx on public.automation_devices(store_id, device_type, state);
create index automation_scenes_store_type_idx on public.automation_scenes(store_id, scene_type, is_enabled);
create index automation_scene_steps_scene_idx on public.automation_scene_steps(scene_id, step_order);
create index access_sessions_store_status_idx on public.access_sessions(store_id, status, started_at desc);
create index access_sessions_reservation_idx on public.access_sessions(reservation_id);
create index kiosk_sessions_access_idx on public.kiosk_sessions(access_session_id);
create index automation_logs_store_created_idx on public.automation_logs(store_id, created_at desc);
create index device_logs_store_created_idx on public.device_logs(store_id, created_at desc);
create index device_logs_bay_created_idx on public.device_logs(bay_id, created_at desc);
create index devices_store_status_idx on public.devices(store_id, status);
create index members_store_nickname_idx on public.members(primary_store_id, nickname);
create index games_store_status_idx on public.games(store_id, status, created_at desc);
create index game_players_member_idx on public.game_players(member_id);
create index scores_player_hole_idx on public.scores(game_player_id, hole_no);
create index rankings_store_month_idx on public.rankings(store_id, ranking_month, rank_no);
create index tournaments_store_status_idx on public.tournaments(store_id, status, starts_at);
create index tournament_entries_member_idx on public.tournament_entries(member_id);
create index join_posts_store_status_idx on public.join_posts(store_id, status, preferred_at);
create index reports_store_created_idx on public.reports(store_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_set_updated_at before update on public.users
  for each row execute function public.set_updated_at();
create trigger stores_set_updated_at before update on public.stores
  for each row execute function public.set_updated_at();
create trigger bays_set_updated_at before update on public.bays
  for each row execute function public.set_updated_at();
create trigger reservations_set_updated_at before update on public.reservations
  for each row execute function public.set_updated_at();
create trigger business_hours_set_updated_at before update on public.business_hours
  for each row execute function public.set_updated_at();
create trigger store_notices_set_updated_at before update on public.store_notices
  for each row execute function public.set_updated_at();
create trigger automation_devices_set_updated_at before update on public.automation_devices
  for each row execute function public.set_updated_at();
create trigger automation_scenes_set_updated_at before update on public.automation_scenes
  for each row execute function public.set_updated_at();
create trigger access_sessions_set_updated_at before update on public.access_sessions
  for each row execute function public.set_updated_at();
create trigger kiosk_sessions_set_updated_at before update on public.kiosk_sessions
  for each row execute function public.set_updated_at();
create trigger devices_set_updated_at before update on public.devices
  for each row execute function public.set_updated_at();
create trigger members_set_updated_at before update on public.members
  for each row execute function public.set_updated_at();
create trigger courses_set_updated_at before update on public.courses
  for each row execute function public.set_updated_at();
create trigger games_set_updated_at before update on public.games
  for each row execute function public.set_updated_at();
create trigger scores_set_updated_at before update on public.scores
  for each row execute function public.set_updated_at();
create trigger tournaments_set_updated_at before update on public.tournaments
  for each row execute function public.set_updated_at();
create trigger join_posts_set_updated_at before update on public.join_posts
  for each row execute function public.set_updated_at();
create trigger join_applications_set_updated_at before update on public.join_applications
  for each row execute function public.set_updated_at();

create or replace function public.mask_phone_last4(p_last4 char(4))
returns text
language sql
immutable
as $$
  select case
    when p_last4 is null then null
    else '010-****-' || p_last4
  end;
$$;

create or replace view public.member_scorecards
with (security_invoker = true)
as
select
  gp.id as game_player_id,
  gp.member_id,
  g.id as game_id,
  g.store_id,
  g.course_id,
  g.tournament_id,
  g.title as game_title,
  g.completed_at,
  coalesce(sum(s.strokes), 0)::integer as total_strokes,
  coalesce(sum(s.strokes - s.par), 0)::integer as score_to_par,
  count(s.id)::integer as holes_played
from public.game_players gp
join public.games g on g.id = gp.game_id
left join public.scores s on s.game_player_id = gp.id
where g.status = 'completed'
group by gp.id, gp.member_id, g.id, g.store_id, g.course_id, g.tournament_id, g.title, g.completed_at;

create or replace view public.monthly_store_rankings
with (security_invoker = true)
as
select
  date_trunc('month', ms.completed_at)::date as ranking_month,
  ms.store_id,
  ms.member_id,
  m.nickname,
  public.mask_phone_last4(m.phone_last4) as masked_phone,
  min(ms.total_strokes) as best_score,
  count(*) as round_count,
  rank() over (
    partition by date_trunc('month', ms.completed_at), ms.store_id
    order by min(ms.total_strokes) asc, count(*) desc
  ) as rank_no
from public.member_scorecards ms
join public.members m on m.id = ms.member_id
where ms.completed_at is not null
  and ms.member_id is not null
group by date_trunc('month', ms.completed_at), ms.store_id, ms.member_id, m.nickname, m.phone_last4;

create or replace view public.tournament_result_rows
with (security_invoker = true)
as
select
  t.id as tournament_id,
  t.store_id,
  t.title as tournament_title,
  m.id as member_id,
  m.nickname,
  public.mask_phone_last4(m.phone_last4) as masked_phone,
  min(ms.total_strokes) as best_score,
  rank() over (
    partition by t.id
    order by min(ms.total_strokes) asc
  ) as rank_no
from public.tournaments t
join public.tournament_entries te on te.tournament_id = t.id
join public.members m on m.id = te.member_id
left join public.member_scorecards ms on ms.tournament_id = t.id and ms.member_id = m.id
group by t.id, t.store_id, t.title, m.id, m.nickname, m.phone_last4;

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select u.role from public.users u where u.id = auth.uid()),
    'member'::public.app_role
  );
$$;

create or replace function public.is_head_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() = 'head_admin'::public.app_role;
$$;

create or replace function public.has_store_role(p_store_id uuid, p_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_head_admin()
    or exists (
      select 1
      from public.store_users su
      where su.store_id = p_store_id
        and su.user_id = auth.uid()
        and su.role = any(p_roles)
    );
$$;

create or replace function public.is_store_member(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.members m
    where m.primary_store_id = p_store_id
      and m.auth_user_id = auth.uid()
  );
$$;

create or replace function public.is_member_account(p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.members m
    where m.id = p_member_id
      and m.auth_user_id = auth.uid()
  );
$$;

alter table public.users enable row level security;
alter table public.stores enable row level security;
alter table public.store_users enable row level security;
alter table public.bays enable row level security;
alter table public.reservations enable row level security;
alter table public.business_hours enable row level security;
alter table public.no_show_logs enable row level security;
alter table public.store_notices enable row level security;
alter table public.future_game_scores enable row level security;
alter table public.automation_devices enable row level security;
alter table public.automation_scenes enable row level security;
alter table public.automation_scene_steps enable row level security;
alter table public.access_sessions enable row level security;
alter table public.kiosk_sessions enable row level security;
alter table public.automation_logs enable row level security;
alter table public.device_logs enable row level security;
alter table public.devices enable row level security;
alter table public.members enable row level security;
alter table public.courses enable row level security;
alter table public.course_holes enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.scores enable row level security;
alter table public.rankings enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_entries enable row level security;
alter table public.join_posts enable row level security;
alter table public.join_applications enable row level security;
alter table public.reports enable row level security;

create policy users_select_self_or_head on public.users
  for select using (id = auth.uid() or public.is_head_admin());
create policy users_insert_self_or_head on public.users
  for insert with check (id = auth.uid() or public.is_head_admin());
create policy users_update_self_or_head on public.users
  for update using (id = auth.uid() or public.is_head_admin())
  with check (id = auth.uid() or public.is_head_admin());

create policy stores_select_allowed on public.stores
  for select using (
    public.is_head_admin()
    or public.has_store_role(id, array['store_manager', 'staff']::public.app_role[])
    or public.is_store_member(id)
  );
create policy stores_write_head_only on public.stores
  for all using (public.is_head_admin())
  with check (public.is_head_admin());

create policy store_users_select_allowed on public.store_users
  for select using (
    public.is_head_admin()
    or public.has_store_role(store_id, array['store_manager']::public.app_role[])
    or user_id = auth.uid()
  );
create policy store_users_write_head_only on public.store_users
  for all using (public.is_head_admin())
  with check (public.is_head_admin());

create policy bays_select_allowed on public.bays
  for select using (
    public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[])
    or public.is_store_member(store_id)
  );
create policy bays_manage_staff on public.bays
  for all using (public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[]))
  with check (public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[]));

create policy reservations_select_allowed on public.reservations
  for select using (
    public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[])
    or (member_id is not null and public.is_member_account(member_id))
  );
create policy reservations_manage_staff on public.reservations
  for all using (public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[]))
  with check (public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[]));
create policy reservations_insert_member on public.reservations
  for insert with check (
    member_id is not null
    and public.is_member_account(member_id)
    and public.is_store_member(store_id)
    and channel = 'member_app'
  );

create policy business_hours_select_allowed on public.business_hours
  for select using (
    public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[])
    or public.is_store_member(store_id)
  );
create policy business_hours_manage_manager on public.business_hours
  for all using (public.has_store_role(store_id, array['store_manager']::public.app_role[]))
  with check (public.has_store_role(store_id, array['store_manager']::public.app_role[]));

create policy no_show_logs_select_staff on public.no_show_logs
  for select using (public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[]));
create policy no_show_logs_insert_staff on public.no_show_logs
  for insert with check (public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[]));

create policy store_notices_select_allowed on public.store_notices
  for select using (
    is_active = true
    or public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[])
  );
create policy store_notices_manage_staff on public.store_notices
  for all using (public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[]))
  with check (public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[]));

create policy future_game_scores_select_staff on public.future_game_scores
  for select using (
    public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[])
    or (member_id is not null and public.is_member_account(member_id))
  );

create policy automation_devices_select_staff on public.automation_devices
  for select using (public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[]));
create policy automation_devices_manage_manager on public.automation_devices
  for all using (public.has_store_role(store_id, array['store_manager']::public.app_role[]))
  with check (public.has_store_role(store_id, array['store_manager']::public.app_role[]));

create policy automation_scenes_select_staff on public.automation_scenes
  for select using (public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[]));
create policy automation_scenes_manage_manager on public.automation_scenes
  for all using (public.has_store_role(store_id, array['store_manager']::public.app_role[]))
  with check (public.has_store_role(store_id, array['store_manager']::public.app_role[]));

create policy automation_scene_steps_select_staff on public.automation_scene_steps
  for select using (
    exists (
      select 1 from public.automation_scenes s
      where s.id = automation_scene_steps.scene_id
        and public.has_store_role(s.store_id, array['store_manager', 'staff']::public.app_role[])
    )
  );
create policy automation_scene_steps_manage_manager on public.automation_scene_steps
  for all using (
    exists (
      select 1 from public.automation_scenes s
      where s.id = automation_scene_steps.scene_id
        and public.has_store_role(s.store_id, array['store_manager']::public.app_role[])
    )
  )
  with check (
    exists (
      select 1 from public.automation_scenes s
      where s.id = automation_scene_steps.scene_id
        and public.has_store_role(s.store_id, array['store_manager']::public.app_role[])
    )
  );

create policy access_sessions_select_allowed on public.access_sessions
  for select using (
    public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[])
    or (member_id is not null and public.is_member_account(member_id))
  );
create policy access_sessions_manage_staff on public.access_sessions
  for all using (public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[]))
  with check (public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[]));

create policy kiosk_sessions_select_staff on public.kiosk_sessions
  for select using (
    exists (
      select 1 from public.access_sessions s
      where s.id = kiosk_sessions.access_session_id
        and public.has_store_role(s.store_id, array['store_manager', 'staff']::public.app_role[])
    )
  );
create policy kiosk_sessions_manage_staff on public.kiosk_sessions
  for all using (
    exists (
      select 1 from public.access_sessions s
      where s.id = kiosk_sessions.access_session_id
        and public.has_store_role(s.store_id, array['store_manager', 'staff']::public.app_role[])
    )
  )
  with check (
    exists (
      select 1 from public.access_sessions s
      where s.id = kiosk_sessions.access_session_id
        and public.has_store_role(s.store_id, array['store_manager', 'staff']::public.app_role[])
    )
  );

create policy automation_logs_select_staff on public.automation_logs
  for select using (public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[]));
create policy automation_logs_insert_staff on public.automation_logs
  for insert with check (public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[]));

create policy device_logs_select_staff on public.device_logs
  for select using (
    store_id is not null
    and public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[])
  );
create policy device_logs_insert_staff on public.device_logs
  for insert with check (
    store_id is not null
    and public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[])
  );

create policy devices_select_allowed on public.devices
  for select using (
    public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[])
    or public.is_store_member(store_id)
  );
create policy devices_manage_staff on public.devices
  for all using (public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[]))
  with check (public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[]));

create policy members_select_allowed on public.members
  for select using (
    public.has_store_role(primary_store_id, array['store_manager', 'staff']::public.app_role[])
    or auth_user_id = auth.uid()
  );
create policy members_manage_staff on public.members
  for all using (public.has_store_role(primary_store_id, array['store_manager', 'staff']::public.app_role[]))
  with check (public.has_store_role(primary_store_id, array['store_manager', 'staff']::public.app_role[]));

create policy courses_select_allowed on public.courses
  for select using (
    store_id is null
    or public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[])
    or public.is_store_member(store_id)
  );
create policy courses_manage_staff on public.courses
  for all using (store_id is not null and public.has_store_role(store_id, array['store_manager']::public.app_role[]))
  with check (store_id is not null and public.has_store_role(store_id, array['store_manager']::public.app_role[]));

create policy course_holes_select_allowed on public.course_holes
  for select using (
    exists (
      select 1 from public.courses c
      where c.id = course_holes.course_id
        and (
          c.store_id is null
          or public.has_store_role(c.store_id, array['store_manager', 'staff']::public.app_role[])
          or public.is_store_member(c.store_id)
        )
    )
  );
create policy course_holes_manage_manager on public.course_holes
  for all using (
    exists (
      select 1 from public.courses c
      where c.id = course_holes.course_id
        and c.store_id is not null
        and public.has_store_role(c.store_id, array['store_manager']::public.app_role[])
    )
  )
  with check (
    exists (
      select 1 from public.courses c
      where c.id = course_holes.course_id
        and c.store_id is not null
        and public.has_store_role(c.store_id, array['store_manager']::public.app_role[])
    )
  );

create policy games_select_allowed on public.games
  for select using (
    public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[])
    or exists (
      select 1
      from public.game_players gp
      join public.members m on m.id = gp.member_id
      where gp.game_id = games.id
        and m.auth_user_id = auth.uid()
    )
  );
create policy games_manage_staff on public.games
  for all using (public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[]))
  with check (public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[]));

create policy game_players_select_allowed on public.game_players
  for select using (
    exists (
      select 1 from public.games g
      where g.id = game_players.game_id
        and public.has_store_role(g.store_id, array['store_manager', 'staff']::public.app_role[])
    )
    or (member_id is not null and public.is_member_account(member_id))
  );
create policy game_players_manage_staff on public.game_players
  for all using (
    exists (
      select 1 from public.games g
      where g.id = game_players.game_id
        and public.has_store_role(g.store_id, array['store_manager', 'staff']::public.app_role[])
    )
  )
  with check (
    exists (
      select 1 from public.games g
      where g.id = game_players.game_id
        and public.has_store_role(g.store_id, array['store_manager', 'staff']::public.app_role[])
    )
  );

create policy scores_select_allowed on public.scores
  for select using (
    exists (
      select 1
      from public.game_players gp
      join public.games g on g.id = gp.game_id
      where gp.id = scores.game_player_id
        and (
          public.has_store_role(g.store_id, array['store_manager', 'staff']::public.app_role[])
          or (gp.member_id is not null and public.is_member_account(gp.member_id))
        )
    )
  );
create policy scores_manage_staff on public.scores
  for all using (
    exists (
      select 1
      from public.game_players gp
      join public.games g on g.id = gp.game_id
      where gp.id = scores.game_player_id
        and public.has_store_role(g.store_id, array['store_manager', 'staff']::public.app_role[])
    )
  )
  with check (
    exists (
      select 1
      from public.game_players gp
      join public.games g on g.id = gp.game_id
      where gp.id = scores.game_player_id
        and public.has_store_role(g.store_id, array['store_manager', 'staff']::public.app_role[])
    )
  );

create policy rankings_select_allowed on public.rankings
  for select using (
    public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[])
    or public.is_store_member(store_id)
  );
create policy rankings_write_staff on public.rankings
  for all using (public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[]))
  with check (public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[]));

create policy tournaments_select_allowed on public.tournaments
  for select using (
    public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[])
    or public.is_store_member(store_id)
  );
create policy tournaments_manage_manager on public.tournaments
  for all using (public.has_store_role(store_id, array['store_manager']::public.app_role[]))
  with check (public.has_store_role(store_id, array['store_manager']::public.app_role[]));

create policy tournament_entries_select_allowed on public.tournament_entries
  for select using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_entries.tournament_id
        and (
          public.has_store_role(t.store_id, array['store_manager', 'staff']::public.app_role[])
          or public.is_store_member(t.store_id)
        )
    )
  );
create policy tournament_entries_manage_staff on public.tournament_entries
  for all using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_entries.tournament_id
        and public.has_store_role(t.store_id, array['store_manager', 'staff']::public.app_role[])
    )
  )
  with check (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_entries.tournament_id
        and public.has_store_role(t.store_id, array['store_manager', 'staff']::public.app_role[])
    )
  );

create policy join_posts_select_allowed on public.join_posts
  for select using (
    status = 'open'
    or author_user_id = auth.uid()
    or (author_member_id is not null and public.is_member_account(author_member_id))
    or public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[])
  );
create policy join_posts_insert_member_or_staff on public.join_posts
  for insert with check (
    public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[])
    or (author_user_id = auth.uid() and public.is_store_member(store_id))
    or (author_member_id is not null and public.is_member_account(author_member_id))
  );
create policy join_posts_update_author_or_staff on public.join_posts
  for update using (
    author_user_id = auth.uid()
    or (author_member_id is not null and public.is_member_account(author_member_id))
    or public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[])
  )
  with check (
    author_user_id = auth.uid()
    or (author_member_id is not null and public.is_member_account(author_member_id))
    or public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[])
  );

create policy join_applications_select_allowed on public.join_applications
  for select using (
    public.is_member_account(member_id)
    or exists (
      select 1
      from public.join_posts jp
      where jp.id = join_applications.join_post_id
        and (
          jp.author_user_id = auth.uid()
          or (jp.author_member_id is not null and public.is_member_account(jp.author_member_id))
          or public.has_store_role(jp.store_id, array['store_manager', 'staff']::public.app_role[])
        )
    )
  );
create policy join_applications_insert_own_member on public.join_applications
  for insert with check (public.is_member_account(member_id));
create policy join_applications_update_allowed on public.join_applications
  for update using (
    public.is_member_account(member_id)
    or exists (
      select 1
      from public.join_posts jp
      where jp.id = join_applications.join_post_id
        and (
          jp.author_user_id = auth.uid()
          or (jp.author_member_id is not null and public.is_member_account(jp.author_member_id))
          or public.has_store_role(jp.store_id, array['store_manager', 'staff']::public.app_role[])
        )
    )
  )
  with check (
    public.is_member_account(member_id)
    or exists (
      select 1
      from public.join_posts jp
      where jp.id = join_applications.join_post_id
        and (
          jp.author_user_id = auth.uid()
          or (jp.author_member_id is not null and public.is_member_account(jp.author_member_id))
          or public.has_store_role(jp.store_id, array['store_manager', 'staff']::public.app_role[])
        )
    )
  );

create policy reports_select_allowed on public.reports
  for select using (
    requested_by_user_id = auth.uid()
    or public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[])
  );
create policy reports_insert_staff on public.reports
  for insert with check (
    requested_by_user_id = auth.uid()
    and public.has_store_role(store_id, array['store_manager', 'staff']::public.app_role[])
  );
