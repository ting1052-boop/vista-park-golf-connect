-- 매장 제어기 전용 토큰.
--
-- 지금까지 제어기는 Vercel 환경변수 STORE_CONTROLLER_TOKEN 하나로 인증했고, 그 토큰을 가진 쪽은
-- x-store-id 헤더로 어느 매장이든 골라 명령을 가져갈 수 있었다. 이 테이블의 토큰은 매장에 고정된다.
-- 토큰 원문은 저장하지 않고 SHA-256 해시만 저장한다.
--
-- RLS 를 켜고 정책을 만들지 않는다. service_role 만 읽을 수 있다(다른 비밀 테이블과 같은 방식).

create table if not exists public.store_controller_tokens (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  label text not null default '매장 제어기',
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists store_controller_tokens_store_idx
  on public.store_controller_tokens (store_id);

alter table public.store_controller_tokens enable row level security;
revoke all on public.store_controller_tokens from anon, authenticated;
