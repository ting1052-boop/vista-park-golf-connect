-- VISTA Park Golf Connect
-- Siheung showroom automation device mapping for Hejhome and Tapo field tests.
-- Run after schema.sql or setup-core.sql when automation tables exist.

insert into public.automation_devices (
  id,
  store_id,
  bay_id,
  provider,
  device_type,
  display_name,
  external_device_id,
  state,
  is_safety_critical,
  memo
)
values
  ('ad111111-0101-4000-8000-000000000101', '11111111-1111-4111-8111-111111111111', null, 'hejhome', 'etc', '골프룸 켜기', 'hejhome-scene-golf-room-on', 'unknown', false, '헤이홈 빠른실행. 예약 10분 전 쇼룸 준비용'),
  ('ad111111-0102-4000-8000-000000000102', '11111111-1111-4111-8111-111111111111', null, 'hejhome', 'light', '골프룸조명스위치', 'hejhome-golf-room-light-switch', 'unknown', false, '골프룸 조명 제어'),
  ('ad111111-0103-4000-8000-000000000103', '11111111-1111-4111-8111-111111111111', null, 'hejhome', 'hvac', '골프룸 AC', 'hejhome-golf-room-ac', 'unknown', false, '예약 전 냉난방 준비'),
  ('ad111111-0104-4000-8000-000000000104', '11111111-1111-4111-8111-111111111111', null, 'hejhome', 'hvac', '비스타 홀AC', 'hejhome-hall-ac', 'unknown', false, '홀 냉난방'),
  ('ad111111-0105-4000-8000-000000000105', '11111111-1111-4111-8111-111111111111', null, 'hejhome', 'light', '비스타 홀.', 'hejhome-vista-hall-light', 'unknown', false, '로비/홀 조명. 공용 ON/OFF 대상'),
  ('ad111111-0106-4000-8000-000000000106', '11111111-1111-4111-8111-111111111111', null, 'hejhome', 'etc', '비스타 입구', 'hejhome-vista-entry', 'unknown', true, '자동문 관련. 1차 MVP에서는 자동 실행 제외'),
  ('ad111111-0107-4000-8000-000000000107', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0001-4000-8000-000000000001', 'hejhome', 'screen_equipment', '1번타석 프로젝터', 'hejhome-bay-01-projector', 'unknown', false, '프로젝터 전원 ON/OFF'),
  ('ad111111-0108-4000-8000-000000000108', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0001-4000-8000-000000000001', 'hejhome', 'screen_equipment', '1번타석 리시버', 'hejhome-bay-01-receiver', 'unknown', false, '리시버 전원 ON/OFF'),
  ('ad111111-0109-4000-8000-000000000109', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0002-4000-8000-000000000002', 'hejhome', 'screen_equipment', '2번타석 프로젝터', 'hejhome-bay-02-projector', 'unknown', false, '프로젝터 전원 ON/OFF'),
  ('ad111111-0110-4000-8000-000000000110', '11111111-1111-4111-8111-111111111111', null, 'hejhome', 'screen_equipment', '3번타석 프로젝터', 'hejhome-bay-03-projector', 'unknown', false, '프로젝터 전원 ON/OFF'),
  ('ad111111-0201-4000-8000-000000000201', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0001-4000-8000-000000000001', 'tapo', 'smart_plug', '1번타석 PC', 'tapo-bay-01-pc', 'unknown', false, 'PC 전원 인가. 전원 인가 후 자동부팅'),
  ('ad111111-0202-4000-8000-000000000202', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0002-4000-8000-000000000002', 'tapo', 'smart_plug', '2번타석 PC', 'tapo-bay-02-pc', 'unknown', false, 'PC 전원 인가. 전원 인가 후 자동부팅'),
  ('ad111111-0203-4000-8000-000000000203', '11111111-1111-4111-8111-111111111111', null, 'tapo', 'smart_plug', '3번타석 PC', 'tapo-bay-03-pc', 'unknown', false, 'PC 전원 인가. 전원 인가 후 자동부팅'),
  ('ad111111-0204-4000-8000-000000000204', '11111111-1111-4111-8111-111111111111', null, 'tapo', 'etc', '비스타 2층', 'tapo-vista-2f', 'unknown', false, '공간 전원 또는 보조 장비'),
  ('ad111111-0205-4000-8000-000000000205', '11111111-1111-4111-8111-111111111111', null, 'tapo', 'etc', '비스타 골프룸', 'tapo-vista-golf-room', 'unknown', false, '골프룸 보조 전원'),
  ('ad111111-0206-4000-8000-000000000206', '11111111-1111-4111-8111-111111111111', null, 'tapo', 'kiosk', '비스타_로비', 'tapo-vista-lobby', 'unknown', false, '로비/키오스크 계열 전원'),
  ('ad111111-0207-4000-8000-000000000207', '11111111-1111-4111-8111-111111111111', null, 'tapo', 'screen_equipment', '비스타__스크린', 'tapo-vista-screen', 'unknown', false, '스크린 장비 전원 확인')
on conflict (id) do update set
  provider = excluded.provider,
  device_type = excluded.device_type,
  display_name = excluded.display_name,
  external_device_id = excluded.external_device_id,
  is_safety_critical = excluded.is_safety_critical,
  memo = excluded.memo,
  updated_at = now();

insert into public.automation_scenes (id, store_id, name, scene_type, trigger_offset_minutes, requires_manual_confirm, memo)
values
  ('as111111-0101-4000-8000-000000000101', '11111111-1111-4111-8111-111111111111', '시흥 쇼룸 예약 10분 전 준비', 'reservation_prepare', -10, false, '골프룸 조명/AC, 해당 타석 PC, 프로젝터, 리시버를 예약 전 준비'),
  ('as111111-0102-4000-8000-000000000102', '11111111-1111-4111-8111-111111111111', '시흥 쇼룸 이용 종료 정리', 'session_end', 5, false, '종료 후 타석 PC/프로젝터/리시버/조명 정리'),
  ('as111111-0103-4000-8000-000000000103', '11111111-1111-4111-8111-111111111111', '시흥 쇼룸 마감 전체 OFF', 'closing', 0, true, '관리자 확인 후 전체 전원 정리')
on conflict (id) do update set
  name = excluded.name,
  scene_type = excluded.scene_type,
  trigger_offset_minutes = excluded.trigger_offset_minutes,
  requires_manual_confirm = excluded.requires_manual_confirm,
  memo = excluded.memo,
  updated_at = now();
