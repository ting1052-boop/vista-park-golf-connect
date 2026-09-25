-- VISTA Park Golf Connect
-- 송도파크자이 Windows Agent 등록 템플릿 (타석 9개)
--
-- 시흥점 템플릿과 다른 점
--   1) UUID 를 직접 붙여넣지 않는다. 매장 코드와 타석 코드로 찾는다.
--   2) 9개가 전부 맞지 않으면 아무것도 등록하지 않고 중단한다.
--      일부만 등록되면 어느 타석이 빠졌는지 모른 채 현장에 나가게 된다.
--
-- 사용법
-- 1) [1단계] 만 실행해서 송도 매장 코드와 타석 bay_code 9개를 눈으로 확인한다.
-- 2) [2단계] 의 매장 코드와 bay_code 열을 1단계 결과와 똑같이 고친다.
-- 3) [2단계] 를 실행한다. 성공하면 "송도 Agent 9개 등록 완료" 가 나온다.
-- 4) 같은 원문 토큰을 각 타석 PC 의
--    %APPDATA%\vista-windows-agent\bays.config.local.json 에 넣는다.
--    (windows-agent/songdo/Agent설치.ps1 이 자동으로 해준다.)
--
-- 토큰 만들기: windows-agent/songdo/토큰만들기.ps1 이 이 파일을 채워서
--              "등록SQL-작성됨.sql" 을 만든다. 그 파일은 커밋하지 않는다.
--
-- 재실행하면 기존 토큰을 덮어쓴다(on conflict do update). 이미 설치된 PC 는
-- 즉시 401 이 되므로, 재발급했으면 9대 모두 다시 설치해야 한다.

-- ===== [1단계] 실제 매장/타석 코드 확인 =====
select s.code as store_code, s.name as store_name, b.bay_code, b.display_name
from public.bays b
join public.stores s on s.id = b.store_id
where s.name like '%송도%'
order by b.bay_code;

-- ===== [2단계] Agent 9개 등록 (전부 맞을 때만) =====

create extension if not exists pgcrypto;

do $$
declare
  v_store_id uuid;
  v_store_code text := 'REPLACE_WITH_SONGDO_STORE_CODE';
  v_matched integer;
  v_missing text;
begin
  select id into v_store_id from public.stores where code = v_store_code;
  if v_store_id is null then
    raise exception '매장 코드 "%" 를 찾을 수 없습니다. [1단계] 의 store_code 를 확인하세요.', v_store_code;
  end if;

  create temporary table tmp_songdo_agents (bay_code text, label text, token text) on commit drop;
  insert into tmp_songdo_agents (bay_code, label, token) values
    ('A-01', '골프 1번 Agent', 'REPLACE_WITH_SONGDO_RANGE_01_AGENT_TOKEN'),
    ('A-02', '골프 2번 Agent', 'REPLACE_WITH_SONGDO_RANGE_02_AGENT_TOKEN'),
    ('A-03', '골프 3번 Agent', 'REPLACE_WITH_SONGDO_RANGE_03_AGENT_TOKEN'),
    ('A-04', '골프 4번 Agent', 'REPLACE_WITH_SONGDO_RANGE_04_AGENT_TOKEN'),
    ('A-05', '골프 5번 Agent', 'REPLACE_WITH_SONGDO_RANGE_05_AGENT_TOKEN'),
    ('A-06', '골프 6번 Agent', 'REPLACE_WITH_SONGDO_RANGE_06_AGENT_TOKEN'),
    ('A-07', '골프 7번 Agent', 'REPLACE_WITH_SONGDO_RANGE_07_AGENT_TOKEN'),
    ('P-01', '파크 1번 Agent', 'REPLACE_WITH_SONGDO_PARK_01_AGENT_TOKEN'),
    ('P-02', '파크 2번 Agent', 'REPLACE_WITH_SONGDO_PARK_02_AGENT_TOKEN');

  -- 자리표시자가 남아 있으면 토큰을 안 채운 것이다.
  if exists (select 1 from tmp_songdo_agents where token like 'REPLACE\_WITH\_%') then
    raise exception '토큰을 채우지 않았습니다. windows-agent/songdo/토큰만들기.ps1 이 만든 파일을 사용하세요.';
  end if;

  -- 이 매장에서 실제로 찾은 타석 수. 9가 아니면 한 줄도 넣지 않는다.
  select count(*) into v_matched
  from tmp_songdo_agents t
  join public.bays b on b.store_id = v_store_id and b.bay_code = t.bay_code;

  if v_matched <> 9 then
    select string_agg(t.bay_code, ', ' order by t.bay_code) into v_missing
    from tmp_songdo_agents t
    where not exists (
      select 1 from public.bays b where b.store_id = v_store_id and b.bay_code = t.bay_code
    );
    raise exception '타석 9개 중 %개만 찾았습니다. 등록을 취소합니다. 없는 코드: %', v_matched, coalesce(v_missing, '(없음)');
  end if;

  -- 다른 매장 타석을 잡지 않았는지 한 번 더 확인한다.
  if exists (
    select 1 from public.agent_devices a
    join public.bays b on b.id = a.bay_id
    where b.bay_code in (select bay_code from tmp_songdo_agents)
      and b.store_id <> v_store_id
      and a.store_id = v_store_id
  ) then
    raise exception '다른 매장 타석이 송도 매장으로 등록돼 있습니다. 먼저 정리하세요.';
  end if;

  insert into public.agent_devices (store_id, bay_id, label, token_hash, is_active)
  select v_store_id, b.id, t.label, encode(digest(t.token, 'sha256'), 'hex'), true
  from tmp_songdo_agents t
  join public.bays b on b.store_id = v_store_id and b.bay_code = t.bay_code
  on conflict (bay_id) do update set
    store_id = excluded.store_id,
    label = excluded.label,
    token_hash = excluded.token_hash,
    is_active = true,
    updated_at = now();

  raise notice '송도 Agent 9개 등록 완료 (매장 %)', v_store_code;
end $$;

-- ===== [3단계] 등록 결과 확인 =====
-- 9행이 나오고 store_name 이 전부 송도여야 한다.
select s.name as store_name, b.bay_code, a.label, a.is_active,
       a.pc_name, a.agent_version, a.last_seen_at
from public.agent_devices a
join public.bays b on b.id = a.bay_id
join public.stores s on s.id = a.store_id
where s.name like '%송도%'
order by b.bay_code;

-- pc_name 과 agent_version 은 비어 있는 게 정상이다.
-- Agent 가 첫 heartbeat 를 보내면 채워진다. 설치 확인에 이 두 열을 쓰면 된다.
