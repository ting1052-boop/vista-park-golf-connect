-- 매장별 이용시간·요금표를 관리자 화면에서 수정할 수 있게 한다.
-- 값이 비어 있으면(null) 코드의 기본 요금표(src/lib/reservation-policy.ts)를 그대로 쓴다.
--
-- 형식: [{ "minutes": 60, "price": 10000, "bonusMinutes": 10 }, ...]
--   minutes      이용시간(분)
--   price        요금(원)
--   bonusMinutes 서비스로 더 주는 시간(분)

alter table public.store_settings
  add column if not exists duration_options jsonb;

-- 저장되는 값이 항상 배열 형태이도록 최소한만 강제한다.
-- 각 항목의 세부 검증은 애플리케이션에서 수행한다.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'store_settings_duration_options_check'
  ) then
    alter table public.store_settings
      add constraint store_settings_duration_options_check
      check (duration_options is null or jsonb_typeof(duration_options) = 'array');
  end if;
end $$;
