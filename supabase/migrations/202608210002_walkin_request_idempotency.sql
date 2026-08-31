-- 키오스크 현장 이용의 중복 요청을 서버에서 막는다.
--
-- 같은 요청번호(walk_in_request_id)가 다시 들어오면 새 예약·세션을 만들지 않고
-- 이미 만들어진 것을 그대로 돌려준다. 터치 더블탭, 네트워크 재전송, 향후 결제
-- 콜백 재시도까지 같은 방식으로 안전해진다.

alter table public.reservations
  add column if not exists walk_in_request_id text;

-- 값이 있는 행끼리만 유일성을 강제한다(기존 예약은 null 이라 영향 없음).
create unique index if not exists reservations_walk_in_request_id_key
  on public.reservations (walk_in_request_id)
  where walk_in_request_id is not null;
