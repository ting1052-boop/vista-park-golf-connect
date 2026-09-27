-- 매장별 Agent 동작 방식.
--
-- true  = 아파트 커뮤니티 시설처럼 요금·이용시간이 없는 매장.
--         Agent 는 고객 화면(남은시간 경고·잠금)을 띄우지 않고, 세션 만료로
--         서버 상태를 바꾸지 않으며, 스스로 PC 를 끄지 않는다(monitorOnly).
--         게임 상태 감지도 끈다(현장 게임 프로그램이 검증되지 않았다).
-- false = 시흥점 같은 일반 매장.
--
-- PC 세팅 도구가 Agent 를 설치할 때 서버가 이 값을 보고 설정을 만들어 준다.
-- 그래서 이런 매장이 늘어나도 Agent 를 다시 빌드하지 않아도 된다.

alter table public.stores
  add column if not exists agent_monitor_only boolean not null default false;

update public.stores
set agent_monitor_only = true
where code = 'VISTA-XII';

-- 확인: 송도파크자이만 true 여야 한다.
select code, name, agent_monitor_only from public.stores order by code;
