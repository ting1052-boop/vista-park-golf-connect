-- VISTA Park Golf Connect
-- 관리자 역할과 매장 배정.
--
-- src/lib/admin-context.ts 가 이 두 표를 읽어 매장 관리자에게 보여줄 메뉴를
-- 정한다. 표가 없어도 코드는 동작하지만(전부 본사관리자로 취급) 메뉴 제한이
-- 걸리지 않는다.
--
-- 행이 하나도 없으면 지금과 똑같이 동작한다. 기존 계정은 그대로 본사관리자다.
-- 제한을 걸 계정에만 행을 넣는다.

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'staff',
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_role_check check (role in ('head_admin', 'store_manager', 'staff'))
);

create table if not exists public.store_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  role text not null default 'store_manager',
  assigned_at timestamptz not null default now(),
  constraint store_users_role_check check (role in ('head_admin', 'store_manager', 'staff')),
  unique (user_id, store_id)
);

-- admin-context 는 user_id 로 찾아 assigned_at 이 가장 이른 배정을 쓴다.
create index if not exists store_users_user_idx on public.store_users(user_id, assigned_at);
create index if not exists store_users_store_idx on public.store_users(store_id);

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at before update on public.users
  for each row execute function public.set_updated_at();

-- 권한을 정하는 표다. 브라우저 세션에 열면 자기 역할을 스스로 바꿀 수 있다.
-- RLS 를 켜고 정책을 두지 않아 service_role 만 읽고 쓴다.
alter table public.users enable row level security;
alter table public.store_users enable row level security;

drop policy if exists users_select_self on public.users;
drop policy if exists store_users_select_self on public.store_users;

comment on table public.users is
  '관리자 계정의 역할. head_admin 은 전체 메뉴, store_manager/staff 는 배정 매장의 대시보드·무인제어만 본다.';
comment on table public.store_users is
  '관리자 계정의 매장 배정. head_admin 이 아닌 계정은 여기 적힌 매장만 보고 제어한다.';
