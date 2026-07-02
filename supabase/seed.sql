-- VISTA Park Golf Connect sample seed data.
-- Run after supabase/schema.sql.
-- Auth-linked public.users rows are intentionally not inserted here because
-- they require matching auth.users records.

insert into public.stores (id, code, name, operator_name, business_number, address, phone, status, opened_on)
values
  ('11111111-1111-4111-8111-111111111111', 'VISTA-SH', '비스타파크골프 시흥점', 'HH Square', '123-45-67890', '경기도 시흥시 중심상가로 10', '031-100-2000', 'active', '2026-01-10'),
  ('22222222-2222-4222-8222-222222222222', 'VISTA-BD', '비스타파크골프 분당점', 'HH Square', '123-45-67891', '경기도 성남시 분당구 정자로 20', '031-700-2000', 'active', '2026-02-15')
on conflict (id) do nothing;

insert into public.store_settings (
  store_id,
  extension_mode,
  extension_minutes,
  extension_notice_minutes,
  extension_deadline_minutes,
  extension_buffer_minutes,
  extension_price,
  conflict_policy
)
values
  ('11111111-1111-4111-8111-111111111111', 'auto', 30, 10, 3, 10, 6000, 'partial'),
  ('22222222-2222-4222-8222-222222222222', 'manual', 30, 10, 3, 10, 6000, 'manual_review')
on conflict (store_id) do nothing;

insert into public.bays (id, store_id, bay_code, display_name, status, memo)
values
  ('aaaaaaaa-0001-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'A-01', 'A구역 1번 타석', 'in_use', '오전 예약 우선 타석'),
  ('aaaaaaaa-0002-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'A-02', 'A구역 2번 타석', 'available', null),
  ('aaaaaaaa-0003-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'B-01', 'B구역 1번 타석', 'waiting', '청소 후 사용 가능'),
  ('bbbbbbbb-0001-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'A-01', 'A구역 1번 타석', 'available', null)
on conflict (id) do nothing;

insert into public.devices (id, store_id, device_code, name, device_type, status, purchased_on, last_serviced_on, memo)
values
  ('d1111111-0001-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'CLUB-001', '공용 클럽 세트 1', '클럽', 'available', '2026-01-12', '2026-05-15', null),
  ('d1111111-0002-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'BALL-001', '연습 공 세트 1', '공', 'available', '2026-01-12', null, null),
  ('d1111111-0003-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'TAB-001', '현장 접수 태블릿', '태블릿', 'repair', '2026-01-12', '2026-06-01', '터치 패널 점검'),
  ('d2222222-0001-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'CLUB-001', '공용 클럽 세트 1', '클럽', 'available', '2026-02-17', null, null)
on conflict (id) do nothing;

insert into public.members (
  id,
  primary_store_id,
  nickname,
  login_provider,
  provider_subject,
  phone_hash,
  phone_last4,
  age_group,
  is_guest,
  memo
)
values
  ('31111111-0001-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', '서진', 'kakao', 'demo-kakao-2001', encode(digest('01010002001:vista-local-demo', 'sha256'), 'hex'), '2001', null, false, '주간 예약 선호'),
  ('31111111-0002-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', '도윤', 'naver', 'demo-naver-2002', encode(digest('01010002002:vista-local-demo', 'sha256'), 'hex'), '2002', null, false, null),
  ('31111111-0003-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', '지안', 'kakao', 'demo-kakao-2003', encode(digest('01010002003:vista-local-demo', 'sha256'), 'hex'), '2003', null, false, null),
  ('32222222-0001-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', '하린', 'naver', 'demo-naver-3001', encode(digest('01020003001:vista-local-demo', 'sha256'), 'hex'), '3001', null, false, null),
  ('39999999-0001-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', '비회원', null, null, null, null, null, true, '현장 접수 고객')
on conflict (id) do nothing;

insert into public.reservations (id, store_id, bay_id, member_id, guest_name, guest_phone_last4, starts_at, ends_at, party_size, channel, status, memo)
values
  ('9a111111-0001-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0001-4000-8000-000000000001', '31111111-0001-4000-8000-000000000001', null, null, '2026-06-06 09:30:00+09', '2026-06-06 10:30:00+09', 2, 'member_app', 'checked_in', '회원 앱 예약'),
  ('9a111111-0002-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0002-4000-8000-000000000002', '31111111-0002-4000-8000-000000000002', null, null, '2026-06-06 10:00:00+09', '2026-06-06 11:00:00+09', 1, 'phone', 'confirmed', '전화 예약'),
  ('9a111111-0003-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0003-4000-8000-000000000003', '31111111-0003-4000-8000-000000000003', null, null, '2026-06-06 10:30:00+09', '2026-06-06 11:30:00+09', 1, 'member_app', 'confirmed', '회원 앱 예약'),
  ('9a111111-0004-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', null, null, '현장고객', '4040', '2026-06-06 11:00:00+09', '2026-06-06 12:00:00+09', 2, 'walk_in', 'requested', '타석 배정 필요')
on conflict (id) do nothing;

insert into public.business_hours (store_id, day_of_week, open_time, close_time, is_closed)
select '11111111-1111-4111-8111-111111111111', day_no, '09:00'::time, '22:00'::time, false
from generate_series(0, 6) as day_no
on conflict (store_id, day_of_week) do nothing;

insert into public.business_hours (store_id, day_of_week, open_time, close_time, is_closed)
select '22222222-2222-4222-8222-222222222222', day_no, '09:00'::time, '22:00'::time, false
from generate_series(0, 6) as day_no
on conflict (store_id, day_of_week) do nothing;

insert into public.no_show_logs (id, member_id, store_id, reservation_id, reason)
values
  ('0a111111-0001-4000-8000-000000000001', '31111111-0003-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', null, '예약 시간 이후 미방문'),
  ('0a111111-0002-4000-8000-000000000002', null, '11111111-1111-4111-8111-111111111111', '9a111111-0004-4000-8000-000000000004', '현장 예약 미방문')
on conflict (id) do nothing;

insert into public.store_notices (id, store_id, title, content, is_active)
values
  ('0b111111-0001-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', '예약 취소 안내', '방문이 어려운 경우 예약 시간 3시간 전까지 취소해 주세요.', true),
  ('0b111111-0002-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', '주말 단체 예약 안내', '2시간 이상 또는 단체 예약은 매장 승인 후 확정됩니다.', true)
on conflict (id) do nothing;

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
  ('ad111111-0002-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', null, 'tapo', 'kiosk', '로비 키오스크 전원', 'tapo-kiosk-lobby', 'on', false, '상시 운영'),
  ('ad111111-0003-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', null, 'hejhome', 'light', '로비 조명', 'hejhome-light-lobby', 'on', false, null),
  ('ad111111-0004-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0001-4000-8000-000000000001', 'tapo', 'light', 'A-01 타석 조명', 'tapo-light-a01', 'on', false, null),
  ('ad111111-0005-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0001-4000-8000-000000000001', 'hejhome', 'hvac', 'A-01 냉난방기', 'hejhome-ir-a01', 'on', false, 'IR 리모컨 제어'),
  ('ad111111-0006-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0001-4000-8000-000000000001', 'tapo', 'kiosk', 'A-01 키오스크 전원', 'tapo-kiosk-a01', 'on', false, '세션 종료 후 잠금'),
  ('ad111111-0007-4000-8000-000000000007', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0002-4000-8000-000000000002', 'tapo', 'smart_plug', 'A-02 타석 전원', 'tapo-plug-a02', 'off', false, '예약 시작 전 자동 ON')
on conflict (id) do nothing;

insert into public.automation_scenes (id, store_id, name, scene_type, trigger_offset_minutes, requires_manual_confirm, memo)
values
  ('as111111-0001-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', '예약 입장 준비', 'reservation_prepare', -10, false, '예약 10분 전 조명과 냉난방 준비'),
  ('as111111-0003-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', '이용 종료 정리', 'session_end', 5, false, '종료 5분 후 타석 장비 정리'),
  ('as111111-0005-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', '키오스크 세션 시작', 'session_start', 0, false, '입장 인증 후 키오스크 이용시간 시작'),
  ('as111111-0006-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', '긴급 장비 정지', 'emergency_stop', 0, true, '관리자 수동 실행 전용')
on conflict (id) do nothing;

insert into public.automation_scene_steps (scene_id, device_id, step_order, command, command_payload, delay_seconds)
values
  ('as111111-0001-4000-8000-000000000001', 'ad111111-0003-4000-8000-000000000003', 1, 'turn_on', '{"reason":"reservation_prepare"}', 0),
  ('as111111-0001-4000-8000-000000000001', 'ad111111-0005-4000-8000-000000000005', 2, 'turn_on', '{"mode":"cool","temperature":24}', 3),
  ('as111111-0005-4000-8000-000000000005', 'ad111111-0006-4000-8000-000000000006', 1, 'start_session', '{"allowed_minutes":120}', 0),
  ('as111111-0003-4000-8000-000000000003', 'ad111111-0004-4000-8000-000000000004', 1, 'turn_off', '{}', 0),
  ('as111111-0003-4000-8000-000000000003', 'ad111111-0005-4000-8000-000000000005', 2, 'turn_off', '{}', 5)
on conflict (scene_id, step_order) do nothing;

insert into public.access_sessions (
  id,
  store_id,
  reservation_id,
  member_id,
  bay_id,
  party_size,
  status,
  started_at,
  ends_at,
  entry_method
)
values
  ('ac111111-0001-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', '9a111111-0001-4000-8000-000000000001', '31111111-0001-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000001', 2, 'active', '2026-06-06 09:30:00+09', '2026-06-06 11:30:00+09', 'reservation_qr'),
  ('ac111111-0002-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', null, null, 'aaaaaaaa-0003-4000-8000-000000000003', 4, 'pending', null, null, 'walk_in_kiosk')
on conflict (id) do nothing;

insert into public.kiosk_sessions (id, access_session_id, kiosk_device_id, allowed_minutes, remaining_seconds, is_locked)
values
  ('ks111111-0001-4000-8000-000000000001', 'ac111111-0001-4000-8000-000000000001', 'ad111111-0006-4000-8000-000000000006', 120, 4440, false)
on conflict (id) do nothing;

insert into public.automation_logs (
  id,
  store_id,
  device_id,
  scene_id,
  access_session_id,
  reservation_id,
  event_name,
  command,
  status,
  request_payload,
  response_payload
)
values
  ('al111111-0001-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'ad111111-0005-4000-8000-000000000005', 'as111111-0001-4000-8000-000000000001', 'ac111111-0001-4000-8000-000000000001', '9a111111-0001-4000-8000-000000000001', '예약 10분 전 냉난방 ON', 'turn_on', 'success', '{"temperature":24}', '{"ok":true}'),
  ('al111111-0003-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'ad111111-0006-4000-8000-000000000006', 'as111111-0005-4000-8000-000000000005', 'ac111111-0001-4000-8000-000000000001', '9a111111-0001-4000-8000-000000000001', '키오스크 120분 세션 시작', 'start_session', 'success', '{"allowed_minutes":120}', '{"ok":true}')
on conflict (id) do nothing;

insert into public.courses (id, store_id, name, hole_count, par_total, is_active)
values
  ('c1111111-0001-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', '시흥 기본 18홀', 18, 54, true),
  ('c2222222-0001-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', '분당 기본 18홀', 18, 54, true)
on conflict (id) do nothing;

insert into public.course_holes (course_id, hole_no, par, distance_meter)
select 'c1111111-0001-4000-8000-000000000001', hole_no, 3, 45 + hole_no
from generate_series(1, 18) as hole_no
on conflict (course_id, hole_no) do nothing;

insert into public.course_holes (course_id, hole_no, par, distance_meter)
select 'c2222222-0001-4000-8000-000000000001', hole_no, 3, 42 + hole_no
from generate_series(1, 18) as hole_no
on conflict (course_id, hole_no) do nothing;

insert into public.tournaments (id, store_id, course_id, title, description, status, starts_at, ends_at, max_participants)
values
  ('71111111-0001-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'c1111111-0001-4000-8000-000000000001', '6월 매장 정기전', 'HH Square 운영 매장의 6월 정기 대회', 'open', '2026-06-12 10:00:00+09', '2026-06-12 18:00:00+09', 64)
on conflict (id) do nothing;

insert into public.tournament_entries (id, tournament_id, member_id, seed_no)
values
  ('e1111111-0001-4000-8000-000000000001', '71111111-0001-4000-8000-000000000001', '31111111-0001-4000-8000-000000000001', 1),
  ('e1111111-0002-4000-8000-000000000002', '71111111-0001-4000-8000-000000000001', '31111111-0002-4000-8000-000000000002', 2),
  ('e1111111-0003-4000-8000-000000000003', '71111111-0001-4000-8000-000000000001', '31111111-0003-4000-8000-000000000003', 3)
on conflict (id) do nothing;

insert into public.games (id, store_id, bay_id, course_id, tournament_id, title, status, created_via, guest_game, started_at, completed_at)
values
  ('61111111-0001-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0001-4000-8000-000000000001', 'c1111111-0001-4000-8000-000000000001', '71111111-0001-4000-8000-000000000001', '6월 정기전 1조', 'completed', 'admin', false, '2026-06-01 10:00:00+09', '2026-06-01 10:55:00+09'),
  ('61111111-0002-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0002-4000-8000-000000000002', 'c1111111-0001-4000-8000-000000000001', null, '비회원 체험 경기', 'playing', 'kiosk', true, '2026-06-06 14:00:00+09', null)
on conflict (id) do nothing;

insert into public.game_players (id, game_id, member_id, player_type, guest_nickname, player_order, total_strokes, score_to_par, rank_in_game)
values
  ('51111111-0001-4000-8000-000000000001', '61111111-0001-4000-8000-000000000001', '31111111-0001-4000-8000-000000000001', 'member', null, 1, 51, -3, 1),
  ('51111111-0002-4000-8000-000000000002', '61111111-0001-4000-8000-000000000001', '31111111-0002-4000-8000-000000000002', 'member', null, 2, 54, 0, 2),
  ('51111111-0003-4000-8000-000000000003', '61111111-0001-4000-8000-000000000001', '31111111-0003-4000-8000-000000000003', 'member', null, 3, 57, 3, 3),
  ('51111111-0004-4000-8000-000000000004', '61111111-0002-4000-8000-000000000002', null, 'guest', '비회원', 1, 0, 0, null)
on conflict (id) do nothing;

insert into public.scores (game_player_id, hole_no, par, strokes)
select '51111111-0001-4000-8000-000000000001', hole_no, 3,
  case when hole_no in (2, 7, 11) then 2 else 3 end
from generate_series(1, 18) as hole_no
on conflict (game_player_id, hole_no) do nothing;

insert into public.scores (game_player_id, hole_no, par, strokes)
select '51111111-0002-4000-8000-000000000002', hole_no, 3, 3
from generate_series(1, 18) as hole_no
on conflict (game_player_id, hole_no) do nothing;

insert into public.scores (game_player_id, hole_no, par, strokes)
select '51111111-0003-4000-8000-000000000003', hole_no, 3,
  case when hole_no in (4, 9, 16) then 4 else 3 end
from generate_series(1, 18) as hole_no
on conflict (game_player_id, hole_no) do nothing;

insert into public.rankings (id, store_id, member_id, ranking_month, best_score, round_count, rank_no)
values
  ('41111111-0001-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', '31111111-0001-4000-8000-000000000001', '2026-06-01', 51, 3, 1),
  ('41111111-0002-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', '31111111-0002-4000-8000-000000000002', '2026-06-01', 54, 2, 2),
  ('41111111-0003-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', '31111111-0003-4000-8000-000000000003', '2026-06-01', 57, 2, 3)
on conflict (id) do nothing;

insert into public.join_posts (id, store_id, author_member_id, title, content, preferred_at, max_people, status)
values
  ('81111111-0001-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', '31111111-0001-4000-8000-000000000001', '평일 오전 함께 치실 분', '시흥점에서 가볍게 18홀 함께 하실 분을 모집합니다.', '2026-06-10 09:30:00+09', 4, 'open'),
  ('81111111-0002-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', '31111111-0002-4000-8000-000000000002', '주말 연습 조인 마감', '참가자가 모두 모여 마감했습니다.', '2026-06-08 13:00:00+09', 4, 'closed')
on conflict (id) do nothing;

insert into public.join_applications (id, join_post_id, member_id, status, message)
values
  ('a1111111-0001-4000-8000-000000000001', '81111111-0001-4000-8000-000000000001', '31111111-0002-4000-8000-000000000002', 'requested', '참가 신청합니다.'),
  ('a1111111-0002-4000-8000-000000000002', '81111111-0002-4000-8000-000000000002', '31111111-0003-4000-8000-000000000003', 'approved', '마감 전 승인')
on conflict (id) do nothing;

insert into public.reports (id, store_id, game_id, report_type, format, title, html_snapshot)
values (
  '99111111-0001-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '61111111-0001-4000-8000-000000000001',
  'game_result',
  'html',
  '6월 정기전 1조 경기결과',
  '<article><h1>6월 정기전 1조 경기결과</h1><p>1위 서진 51타</p><p>2위 도윤 54타</p><p>3위 지안 57타</p></article>'
)
on conflict (id) do nothing;
