-- VISTA Park Golf Connect
-- 시흥점 Windows Agent 등록 템플릿
--
-- 사용법:
-- 1) 아래 token 원문 3개를 실제 운영 토큰으로 바꿉니다.
-- 2) Supabase SQL Editor에서 실행합니다.
-- 3) 각 타석 PC Agent 설정의 agentToken에는 "원문 토큰"을 넣습니다.
--    DB에는 SHA-256 해시만 저장됩니다.
--
-- 예: vista-bay-01-긴랜덤문자열

create extension if not exists pgcrypto;

with agent_tokens as (
  select
    '11111111-1111-4111-8111-111111111111'::uuid as store_id,
    'aaaaaaaa-0001-4000-8000-000000000001'::uuid as bay_id,
    '1번 타석 Agent'::text as label,
    'VISTA-BAY-01'::text as pc_name,
    'REPLACE_WITH_BAY_01_AGENT_TOKEN'::text as token
  union all
  select
    '11111111-1111-4111-8111-111111111111'::uuid,
    'aaaaaaaa-0002-4000-8000-000000000002'::uuid,
    '2번 타석 Agent'::text,
    'VISTA-BAY-02'::text,
    'REPLACE_WITH_BAY_02_AGENT_TOKEN'::text
  union all
  select
    '11111111-1111-4111-8111-111111111111'::uuid,
    'f306b4ce-e34e-407f-bd45-814731ed482a'::uuid,
    '3번 타석 Agent'::text,
    'VISTA-BAY-03'::text,
    'REPLACE_WITH_BAY_03_AGENT_TOKEN'::text
)
insert into public.agent_devices (
  store_id,
  bay_id,
  label,
  pc_name,
  token_hash,
  is_active
)
select
  store_id,
  bay_id,
  label,
  pc_name,
  encode(digest(token, 'sha256'), 'hex') as token_hash,
  true
from agent_tokens
on conflict (bay_id) do update set
  label = excluded.label,
  pc_name = excluded.pc_name,
  token_hash = excluded.token_hash,
  is_active = true,
  updated_at = now();
