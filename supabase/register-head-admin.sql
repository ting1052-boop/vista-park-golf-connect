-- 본사관리자(HH 본사) 계정을 head_admin 으로 등록한다.
--
-- 왜 필요한가:
--   관리자 화면은 이제 "역할이 있는 계정"만 통과시킨다(기본 거부).
--   지금 본사 계정은 public.users 에 행이 없어, 이 SQL 을 먼저 실행하지 않고
--   새 코드를 배포하면 본사 계정이 잠긴다.
--
-- 실행 순서: 이 SQL 먼저 → 확인 → 그 다음에 코드 배포.

insert into public.users (id, display_name, role)
select u.id,
       coalesce(nullif(u.raw_user_meta_data->>'name', ''), '본사관리자'),
       'head_admin'
from auth.users u
where u.email = 'kjss7590@naver.com'
on conflict (id) do update set role = 'head_admin';

-- 확인: 한 행이 나오고 role 이 head_admin 이어야 한다.
select u.email, pu.display_name, pu.role
from public.users pu
join auth.users u on u.id = pu.id
where u.email = 'kjss7590@naver.com';
