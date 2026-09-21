-- VISTA Park Golf Connect
-- PC 등록 창구.
--
-- 복제 SSD 로 배포한 PC 가 현장에서 토큰 입력 없이 자기 AnyDesk 주소를 등록할 수
-- 있어야 한다. 그렇다고 고정 비밀값을 프로그램이나 소스에 넣으면 그 값은 영구히
-- 유출된 것이나 같다(이 저장소는 공개다). 값을 없애는 대신 시간을 좁힌다.
--
-- 관리자가 설치 작업 동안만 매장별로 창구를 연다. 창이 열려 있는 동안 그 매장의
-- 타석에 한해 토큰 없이 등록할 수 있고, 닫히거나 횟수를 다 쓰면 거부된다.

alter table public.store_settings
  add column if not exists pc_enrollment_until timestamptz,
  add column if not exists pc_enrollment_remaining integer;

alter table public.store_settings
  drop constraint if exists store_settings_pc_enrollment_remaining_check;

alter table public.store_settings
  add constraint store_settings_pc_enrollment_remaining_check check (
    pc_enrollment_remaining is null or pc_enrollment_remaining between 0 and 100
  );

comment on column public.store_settings.pc_enrollment_until is
  '이 시각까지 해당 매장에서 토큰 없는 PC 등록을 허용한다. null 이면 닫힌 상태.';
comment on column public.store_settings.pc_enrollment_remaining is
  '남은 신규 등록 허용 횟수. 창을 열어둔 채 잊어버려도 피해 범위가 갇힌다.';
