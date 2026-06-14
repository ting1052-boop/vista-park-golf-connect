# VISTA Park Golf Connect 배포 메모

## 고객 예약 주소

배포 후 고객에게 안내할 기본 주소는 다음 경로를 사용합니다.

```text
https://YOUR-VERCEL-DOMAIN.vercel.app/reserve
```

관리자 화면은 다음 경로입니다.

```text
https://YOUR-VERCEL-DOMAIN.vercel.app/admin/dashboard
```

## Vercel 환경변수

Vercel Project Settings > Environment Variables에 아래 값을 등록합니다.

```text
NEXT_PUBLIC_SUPABASE_URL=https://bueabyhszssqvlkmjkhd.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_07AGD7TFiM_iCe0lWI22YA_HgSWpvP4
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=https://YOUR-VERCEL-DOMAIN.vercel.app
IOT_WEBHOOK_SECRET=
DEVICE_WEBHOOK_URL=
```

`SUPABASE_SERVICE_ROLE_KEY`, `IOT_WEBHOOK_SECRET`, `DEVICE_WEBHOOK_URL`은 장비제어 API까지 실제 운영할 때 채웁니다.

## Supabase 사전 실행 SQL

고객 예약 저장까지 쓰려면 Supabase SQL Editor에서 다음 파일이 실행되어 있어야 합니다.

```text
supabase/setup-core.sql
supabase/setup-seed.sql
supabase/setup-admin-crud.sql
```

타석 삭제가 적용되지 않으면 다음 파일도 실행합니다.

```text
supabase/fix-bay-delete-policy.sql
```
