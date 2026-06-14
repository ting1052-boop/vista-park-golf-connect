-- VISTA Park Golf Connect
-- Minimal seed data for the admin dashboard.
-- Run this after supabase/setup-core.sql.

insert into public.stores (id, code, name, operator_name, address, phone, status)
values
  ('11111111-1111-4111-8111-111111111111', 'VISTA-SH', '비스타파크골프 시흥점', 'HH Square', '경기도 시흥시 중심상가로 10', '031-100-2000', 'active')
on conflict (id) do update set
  name = excluded.name,
  operator_name = excluded.operator_name,
  address = excluded.address,
  phone = excluded.phone,
  status = excluded.status,
  updated_at = now();

insert into public.bays (id, store_id, bay_code, display_name, status, memo)
values
  ('aaaaaaaa-0001-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'A-01', 'A구역 1번 타석', 'in_use', '회원 예약 입장, 120분 세션 진행 중'),
  ('aaaaaaaa-0002-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'A-02', 'A구역 2번 타석', 'in_use', '종료 안내 또는 30분 연장 확인 필요'),
  ('aaaaaaaa-0003-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'B-01', 'B구역 1번 타석', 'available', '예약 배정 가능 상태'),
  ('aaaaaaaa-0004-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'B-02', 'B구역 2번 타석', 'waiting', '전화번호 또는 QR 인증 후 세션 시작'),
  ('aaaaaaaa-0005-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'C-01', 'C구역 1번 타석', 'maintenance', 'Tapo 플러그 오프라인 확인')
on conflict (id) do update set
  bay_code = excluded.bay_code,
  display_name = excluded.display_name,
  status = excluded.status,
  memo = excluded.memo,
  updated_at = now();

notify pgrst, 'reload schema';
