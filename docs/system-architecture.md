# VISTA Park Golf Connect 시스템 구성도

버전: 2.0 (현행) · 작성일: 2026-08-11 (최초 작성 2026-07-02)
(제품 방향과 기능 배경은 기존 설계 문서 `docs/architecture.md` 참조)

## 1. 전체 구성

```
[고객 휴대폰]      [매장 입구 태블릿]     [관리자 PC]
 모바일 PWA          키오스크             웹 브라우저
 /member/app       /kiosk/entrance        /admin/*
      │                  │                     │
      └──────────────────┼─────────────────────┘
                          ▼
             ┌─────────────────────┐
             │  Next.js 15 앱       │  Vercel 배포
             │  (App Router)        │  https://vista-park-golf-connect.vercel.app
             │  · React 19 화면     │
             │  · middleware (인증) │
             │  · API Routes(16종)  │
             └──────────┬───────────┘
                        │ supabase-js (HTTPS)
                        ▼
             ┌─────────────────────┐
             │  Supabase            │
             │  · PostgreSQL(33 표) │  RLS + 컬럼 권한
             │  · Auth (관리자)     │  이메일/비밀번호
             │  · Realtime (타석)   │  bays 변경 구독
             └──────────┬───────────┘
                        │
      ┌─────────────────┴──────────────────┐
      ▼ (인터넷, 서버→타석PC 폴링)          ▼ (인터넷, 매장→서버 폴링·역방향)
┌───────────────────┐              ┌───────────────────────┐
│ 타석 PC 에이전트     │              │  매장 로컬 제어기        │
│ (Electron, 자체개발) │              │  (PowerShell, 자체개발)  │
│ · 각 타석 PC 상주    │              │  · HA 노트북 상시 실행    │
│ · 세션 조회·하트비트  │              │  · store_controller_    │
│ · 남은시간 오버레이   │              │    commands 큐 폴링      │
│ · 종료 경고·화면잠금  │              │  · 사설망 HA만 호출       │
│ · 종료 후 PC 자동종료 │              └───────────┬────────────┘
└───────────────────┘                          ▼ (LAN, http://192.168.0.44:8123)
                                    ┌─────────────────────┐
                                    │  Home Assistant      │  매장 내 상시 설치
                                    │  · 헤이홈 조명/스위치 │
                                    │  · Tapo 플러그(PC전원)│
                                    │  · 소니 프로젝터(직접 │
                                    │    네트워크 제어)     │
                                    │  · WOL (타석 PC)      │
                                    └─────────────────────┘
```

**핵심 설계 포인트 — 매장 로컬 제어기(자체 고안 아키텍처)**: Vercel(클라우드
서버)은 매장 내부 사설망(Home Assistant, `192.168.0.44`)에 직접 접근할 수
없다. 이 구조적 제약을 해결하기 위해, 매장에 상시 설치된 제어기 프로그램이
서버의 명령 큐(`store_controller_commands`)를 주기적으로 조회(polling)하여
가져간 뒤 매장 내부에서 Home Assistant를 호출하는 방식을 자체 설계하였다.
이 방식은 (1) 브라우저의 HTTPS→사설망 혼합 콘텐츠 차단 문제를 겪지 않고,
(2) 매장 자동화 서버를 인터넷에 노출할 필요가 없어 보안상 유리하다.

## 2. 기술 스택

| 계층 | 기술 | 버전 |
| --- | --- | --- |
| 프런트엔드 | Next.js (App Router), React, TypeScript | 15.x / 19.x / 5.6 |
| 스타일 | Tailwind CSS | 3.4 |
| 백엔드 | Next.js API Routes + Supabase | — |
| 데이터베이스 | PostgreSQL (Supabase 관리형) | 15+ |
| 인증 | Supabase Auth (@supabase/ssr 쿠키 세션) | — |
| 실시간 | Supabase Realtime (postgres_changes) | — |
| 배포 | Vercel (GitHub main 브랜치 자동 배포) | — |
| 앱화 | PWA (manifest + service worker) | — |
| 타석 PC 에이전트 | Electron, electron-builder(portable exe) | 31.x |
| 매장 로컬 제어기 | Windows PowerShell (상시 폴링 프로세스) | — |
| 매장 자동화 서버 | Home Assistant OS (VirtualBox, 매장 노트북 상시 구동) | — |

## 3. 소스코드 구조

```
src/
├── middleware.ts              # /admin/* 인증 게이트
├── app/
│   ├── layout.tsx             # 루트 레이아웃, PWA 메타
│   ├── manifest.ts            # PWA 매니페스트
│   ├── member/app/page.tsx    # 고객 모바일 예약 화면
│   ├── admin/
│   │   ├── login/             # 관리자 로그인
│   │   ├── dashboard/         # 관제 대시보드
│   │   ├── reservations/      # 예약관리
│   │   ├── stores|bays|devices|members/   # CRUD 4종
│   │   ├── automation/        # 무인제어
│   │   └── games|rankings|tournaments|join|reports/
│   └── api/automation/        # 자동 준비·장비 제어 API
├── components/
│   ├── admin-shell.tsx        # 관리자 공통 레이아웃(사이드바)
│   ├── admin-crud-page.tsx    # CRUD 공용 컴포넌트
│   └── pwa-register.tsx       # 서비스 워커 등록
└── lib/
    ├── supabase/              # client/server/admin 클라이언트,
    │                          #   bays 실시간, 예약 오류 변환
    └── automation/            # ha-client, device-map, sessions
windows-agent/                 # 타석 PC 상주 에이전트 (Electron)
├── electron-main.js            # 메인 프로세스: 세션 폴링, 오버레이 창 제어
├── renderer/                   # 오버레이 UI(HTML/CSS/JS)
└── bays.config.json            # 타석별 서버 연결 설정

store-controller/               # 매장 로컬 제어기 (PowerShell)
├── vista-store-controller.ps1  # 명령 큐 폴링 → Home Assistant 호출
└── install-startup.ps1         # Windows 부팅 자동 실행 등록

supabase/
├── schema.sql                 # 전체 스키마 (설계 원본)
├── migrations/                # 운영 DB 적용 이력 (20개 파일)
│   ├── ...realtime_bays_and_device_logs.sql
│   ├── ...reservations_bay_time_exclusion.sql   # 이중예약 DB 차단
│   ├── ...reservation_prepare_automation.sql    # 자동 준비 컬럼
│   ├── ...tighten_rls_and_grants.sql            # 접근권한 강화
│   ├── ...access_session_closeout_idempotency.sql # 종료 처리 멱등성
│   └── ...store_controller_commands.sql         # 매장 제어기 명령 큐
└── seed.sql, setup-*.sql      # 초기 데이터·단계별 설정
```

## 4. 데이터 모델 (주요 테이블, 총 33종)

| 테이블 | 역할 | 핵심 제약 |
| --- | --- | --- |
| `stores` | 매장 | 매장코드 unique, 타석수 0~99 |
| `bays` | 타석 | (매장, 타석코드) unique, 상태 enum |
| `reservations` | 예약 | **`reservations_bay_time_excl`: 동일 타석 시간구간 겹침 금지 (btree_gist, tstzrange)**, 종료>시작, 인원 1~8 |
| `members` | 회원 | 전화 해시 unique, 연령대 체크 |
| `devices` | 장비 | (매장, 장비코드) unique |
| `automation_devices/scenes/logs` | 무인제어 | 장비 매핑, 시나리오, 실행 로그 |
| `access_sessions`, `kiosk_sessions` | 입장/키오스크 세션 | 상태 enum, 종료 시 연결 예약도 함께 종료 처리 |
| `agent_devices` | 타석 PC 에이전트 등록 | 토큰 해시 인증, `last_seen_at`(하트비트)으로 PC 전원 온라인 판정 |
| `store_controller_commands` | 매장 로컬 제어기 명령 큐 | 상태(pending/processing/succeeded/failed/cancelled), lease 기반 원자적 클레임, (세션,명령종류) unique로 멱등 처리 |
| `extension_requests` | 이용시간 연장 요청 | — |
| `games`, `scores`, `rankings`, `tournaments`, `join_posts`, `reports` | 2차 확장용 경기·커뮤니티 | — |

## 5. 보안 모델

### 5.1 인증

- 관리자: Supabase Auth 이메일/비밀번호. 세션은 @supabase/ssr가
  httpOnly 쿠키로 관리. `src/middleware.ts`가 `/admin/*` 전 요청에서
  `auth.getUser()`를 검증하고 미인증 시 `/admin/login`으로 리다이렉트.
- 고객: 무인증(비회원). 이름 + 전화 뒤 4자리만 수집.

### 5.2 데이터 접근 제어 (RLS)

`supabase/migrations/202607010003_tighten_rls_and_grants.sql` 적용 기준:

| 역할 | stores/bays | reservations | devices/members |
| --- | --- | --- | --- |
| anon (공개 키) | 조회만 | 제한 컬럼 조회 + member_app 예약 생성만 | 접근 불가 |
| authenticated (관리자) | 전체 관리 | 전체 관리 | 전체 관리 |
| service_role (서버 API) | RLS 우회 | RLS 우회 | RLS 우회 |

- 컬럼 단위 권한: anon은 `reservations`에서 `guest_name`,
  `guest_phone_last4`, `memo` 등 개인정보 컬럼을 조회할 수 없다
  (가용성 계산에 필요한 시간/타석/상태 컬럼만 허용).
- 예약 생성 시에도 `channel='member_app'`, 상태 requested/confirmed로
  강제되어 익명 키로는 다른 형태의 데이터를 만들 수 없다.

### 5.3 서버 API 보호

자동화 API는 `Authorization: Bearer <시크릿>` 검증
(`CRON_SECRET` 또는 `IOT_WEBHOOK_SECRET`). 시크릿 미설정 시 500으로
거부하여 무방비 배포를 방지한다.

### 5.4 매장 로컬 제어기 인증

`/api/store-controller/commands`는 `Authorization: Bearer <STORE_CONTROLLER_TOKEN>`을
`crypto.timingSafeEqual`(상수 시간 비교)로 검증하여 타이밍 공격을 방지한다.
명령 조회(GET) 시 60초 리스(lease)를 걸어 원자적으로 클레임하며, 리스가
만료된 처리중 명령은 자동으로 pending으로 복구되어 중복 실행 없이 재시도된다.
결과 보고(POST)는 처리 당시의 `controller_id`가 일치해야 반영되어, 다른
제어기 인스턴스가 남의 처리 결과를 덮어쓸 수 없다.

## 6. 이중예약 방지 구조 (핵심 설계)

```
고객 제출
  │ 1) 화면: 시간대별 가용 타석 실시간 계산 → 마감 시간대 비활성화
  │ 2) 제출 직전: 같은 타석·겹치는 구간 재조회 → 있으면 중단
  ▼
INSERT reservations
  │ 3) DB: exclude using gist (bay_id with =,
  │        tstzrange(starts_at, ends_at) with &&)
  │        where 활성 상태(취소/노쇼 제외)
  ▼
 성공 → 예약 확정        실패(23P01) → 한국어 안내
```

1)·2)는 사용자 경험을 위한 사전 차단, 3)은 동시 요청 경합까지
포함한 최종 보증이다. 3)의 동작은 REST 직접 호출 테스트로 검증
완료 (`test-scenarios.md` 참조).

## 7. 배포 흐름

```
로컬 개발 (npm run dev)
  → GitHub main 푸시
  → Vercel 자동 빌드·배포 (프로덕션)
  → Supabase는 별도 관리형 (스키마 변경은 SQL Editor에서
     migrations/*.sql 순서 적용)
```

환경변수: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `IOT_WEBHOOK_SECRET`,
`HOME_ASSISTANT_URL`, `HOME_ASSISTANT_TOKEN`, `STORE_CONTROLLER_ENABLED`,
`STORE_CONTROLLER_TOKEN` (`.env.local.example` 참조)

타석 PC 에이전트는 `npm run dist`(electron-builder --win portable)로
단일 실행파일을 빌드하여 타석 PC에 배포하며, 매장 로컬 제어기는 매장
Home Assistant 노트북에서 부팅 시 자동 실행되도록 등록한다.

## 8. 문서 이력

| 날짜 | 내용 |
| --- | --- |
| 2026-07-02 | 최초 작성 (1차 MVP 기준) |
| 2026-08-11 | 현행 버전으로 갱신 — 타석 PC 에이전트·매장 로컬 제어기를 구성도에 반영, 데이터 모델에 `agent_devices`/`store_controller_commands` 추가, 매장 제어기 인증 절 추가 |
