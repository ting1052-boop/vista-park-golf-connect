-- VISTA Park Golf Connect
-- 타석 PC 원격접속(AnyDesk) 등록부.
--
-- agent_devices 를 확장하지 않고 별도 표로 둔다. agent_devices 는 "VISTA Agent 가
-- 설치된 타석 PC" 를 뜻하고, 그 행 하나하나가 대시보드의 PC 켜짐/꺼짐 판정과
-- 매장 종료 시 종료 명령의 대상이 된다. Agent 가 없는 골프연습장 PC 를 같은 표에
-- 넣으면 영영 꺼져 있는 타석으로 보이고, 존재하지 않는 Agent 에게 종료 명령을
-- 큐에 넣게 된다. token_hash 의 NOT NULL 을 푸는 것만으로는 이 의미가 정리되지
-- 않는다. (확인한 곳: src/lib/supabase/bays-server.ts, src/lib/store-controller.ts,
-- src/app/api/admin/automation/route.ts, src/lib/agent-server.ts,
-- supabase/migrations/202609170001_agent_round_events.sql)
--
-- PC 종류(range/park)는 stores 가 아니라 이 표에 둔다. 한 매장이 연습장과
-- 파크골프를 함께 둘 가능성을 지금 부정할 수 없다. 나중에 매장 단위로 확정되면
-- stores 로 올리는 편이 쉽지, 그 반대는 어렵다.

create table if not exists public.bay_pc_registry (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  store_id uuid not null references public.stores(id) on delete cascade,
  bay_id uuid not null references public.bays(id) on delete cascade,
  pc_type text not null,
  computer_name text not null,
  anydesk_id text not null,
  windows_edition text,
  windows_version text,
  activation_status text not null default 'unknown',
  setup_tool_version text,
  -- 장비별 토큰의 SHA-256. 평문은 발급 응답에서 한 번만 나가고 서버에 남지 않는다.
  device_token_hash text,
  device_token_issued_at timestamptz,
  -- 마지막으로 세팅 도구가 등록을 보낸 시각. 값이 그대로여도 갱신된다.
  registered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bay_pc_registry_device_id_key unique (device_id),
  constraint bay_pc_registry_bay_id_key unique (bay_id),
  constraint bay_pc_registry_anydesk_id_key unique (anydesk_id),
  constraint bay_pc_registry_device_token_hash_key unique (device_token_hash),
  constraint bay_pc_registry_pc_type_check check (pc_type in ('range', 'park')),
  constraint bay_pc_registry_activation_status_check
    check (activation_status in ('licensed', 'unlicensed', 'unknown')),
  -- AnyDesk 주소는 보통 9~10자리지만 버전에 따라 다르다. 자리수 범위만 막는다.
  constraint bay_pc_registry_anydesk_id_check check (anydesk_id ~ '^[0-9]{6,12}$'),
  constraint bay_pc_registry_device_id_check check (device_id ~ '^[0-9a-f]{32,128}$'),
  constraint bay_pc_registry_computer_name_check
    check (computer_name ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,62}$')
);

-- PC 이름 중복은 막지 않는다. 요구사항은 "교체 여부 확인"이지 거부가 아니고,
-- 제약으로 막으면 이미 중복이 있는 DB 에서 마이그레이션이 깨진다. 서버가 경고로 알린다.
create index if not exists bay_pc_registry_store_name_idx
  on public.bay_pc_registry(store_id, computer_name);

create table if not exists public.bay_pc_anydesk_history (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  bay_id uuid references public.bays(id) on delete set null,
  previous_anydesk_id text,
  new_anydesk_id text not null,
  changed_at timestamptz not null default now(),
  change_source text not null default 'setup_tool',
  constraint bay_pc_anydesk_history_source_check
    check (change_source in ('setup_tool', 'admin', 'replace'))
);

create index if not exists bay_pc_anydesk_history_device_idx
  on public.bay_pc_anydesk_history(device_id, changed_at desc);
create index if not exists bay_pc_anydesk_history_bay_idx
  on public.bay_pc_anydesk_history(bay_id, changed_at desc);

drop trigger if exists bay_pc_registry_set_updated_at on public.bay_pc_registry;
create trigger bay_pc_registry_set_updated_at before update on public.bay_pc_registry
  for each row execute function public.set_updated_at();

-- 이 표에는 장비 토큰 해시가 들어 있다. 브라우저 세션(anon/authenticated)에는
-- 정책을 주지 않는다. RLS 를 켜고 정책을 두지 않으면 service_role 만 읽고 쓴다.
-- 관리자 화면은 /api/admin/remote-access 를 거치고, 그 라우트가 로그인 여부를 본다.
alter table public.bay_pc_registry enable row level security;
alter table public.bay_pc_anydesk_history enable row level security;

drop policy if exists bay_pc_registry_select_staff on public.bay_pc_registry;
drop policy if exists bay_pc_registry_manage_manager on public.bay_pc_registry;
drop policy if exists bay_pc_anydesk_history_select_staff on public.bay_pc_anydesk_history;

comment on table public.bay_pc_registry is
  '타석 PC 원격접속 등록부. HH 골프 PC 세팅 도구가 /api/pc-setup/register 로 기록한다.';
comment on column public.bay_pc_registry.device_token_hash is
  '장비별 갱신 토큰의 SHA-256. 이 토큰은 자기 device_id 만 수정할 수 있다.';
comment on column public.bay_pc_registry.registered_at is
  '세팅 도구가 마지막으로 등록을 보낸 시각(값이 동일해도 갱신).';
comment on table public.bay_pc_anydesk_history is
  'AnyDesk ID 변경 및 장비 교체 이력.';
