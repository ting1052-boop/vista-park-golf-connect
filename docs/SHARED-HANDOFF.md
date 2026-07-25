# VISTA Park Golf Connect 공용 작업 원장

최종 갱신: 2026-07-25
공용 기준 파일: 이 문서 하나를 Codex와 Claude Code가 함께 사용한다.

## 작업 규칙

- 작업 시작 전 `npm run preflight`를 실행하고 이 문서를 끝까지 읽는다.
- 다른 작업자의 미커밋 변경을 되돌리거나 덮어쓰지 않는다.
- 코드 수정 전 `현재 작업` 표에 담당 파일과 목적을 기록한다.
- 작업 완료 후 변경 파일, 검증 결과, commit/push/deploy 여부와 남은 문제를 이 문서에 기록한다.
- 비밀번호, Supabase 키, Agent token, Home Assistant token, CRON secret 등 실제 비밀값은 절대 기록하지 않는다.
- 프로덕션 DB 쓰기, migration 실행, 배포, 기기 전원 제어는 사용자 승인 없이 실행하지 않는다.
- 테스트 데이터가 꼭 필요하면 `[TEST]` 표기를 사용하고 즉시 정리한 뒤 작업 이력에 남긴다.

## 현재 작업

| 작업자 | 상태 | 작업 내용 | 담당 파일 |
| --- | --- | --- | --- |
| Codex | 검증 완료·배포 대기 | 대시보드 유령 이용 상태 원인 추적, 이용 상세·정확한 종료 조치 구현 | `src/app/admin/dashboard/`, `src/lib/supabase/bays-server.ts`, `src/lib/dashboard-data.ts`, `src/lib/session-cleanup.ts` |
| Claude Code | 없음 | 새 작업 시작 전 이 표에 등록 | - |

## 저장소와 배포 상태

- 기본 브랜치: `main`
- 프로덕션 주소: `https://vista-park-golf-connect.vercel.app`
- 고객 예약: `/member/app` 또는 `/reserve`
- 입구 키오스크: `/kiosk/entrance?key=...`
- 관리자: `/admin/dashboard`
- 실제 비밀값은 `.env.local`, Vercel Environment Variables, Home Assistant `secrets.yaml`에만 둔다.
- 마지막 확인된 프로덕션 상태(2026-07-14): 관리자 session start/end와 close-expired API가 배포되어 인증 없는 요청에 `401` 응답.
- Vercel Hobby 제한 때문에 5분 주기 Vercel Cron은 제거했다. Home Assistant 스케줄러 템플릿은 `homeassistant/packages/vista_scheduler.yaml`에 있다.

## 구현 완료 기능

- Supabase Auth 기반 관리자 로그인·로그아웃·관리자 경로 보호
- 매장/타석/장비/회원/예약 관리 화면과 Supabase 연결
- 고객 모바일 예약, 이용시간·요금·서비스시간 계산, 이중예약 방지
- 입구 태블릿 키오스크 예약 입장·바로 이용·타석 선택
- `access_sessions`/`kiosk_sessions` 기반 이용시간 관리
- 관리자 수동 입장·수동 이용 종료
- 만료 세션 종료 및 타석 자동 반납 API
- 예약 5분 전 장비 준비 API
- Windows 타석 Agent: 서버 세션 조회, 남은 시간, 10분 전 경고, 연장, 종료 잠금
- Tapo/Home Assistant 장비 제어 연결 구조와 시흥점 장비 매핑
- PWA manifest와 앱 아이콘
- 저작권등록·직접생산 제출용 문서 초안

## DB 적용 상태

사용자가 성공 실행을 확인한 항목:

- 예약 시간 겹침 방지 exclusion constraint
- `202607060001_access_session_closeout_idempotency.sql`
- `202607080001_bays_unique_bay_code.sql`
- Agent device/store settings 관련 migration과 시흥점 Agent 등록

실 DB와 migration 파일이 완전히 일치하는지는 자동 검증 루프에서 별도 확인이 필요하다. 서비스 롤 키만으로 DDL을 실행하지 않는다.

## 최근 검증 결과

2026-07-25 Codex 기준선:

- `npm run typecheck`: 통과
- `npm run lint`: 통과
- `npm --prefix windows-agent run check`: 통과
- `npm run build`: 통과
- 빌드 경고: Supabase SSR 모듈이 Edge Runtime에서 `process.version`을 사용한다는 경고가 있으나 빌드는 성공한다.
- `npm run verify:quick`: typecheck, lint, Windows Agent 구문 검사, HTTP 스모크 테스트 15종 통과
- `npm run verify`: 위 검사와 Next.js 프로덕션 빌드까지 모두 통과
- HTTP 검증은 화면/정적 자산 응답, 관리자·키오스크·크론 API 인증 차단, 예약 조회 입력 검증을 포함한다.
- 관리자 로그인 Suspense 초기 화면을 추가해 느린 네트워크에서도 빈 화면이 나오지 않는다.
- 고객 예약 화면은 실제 타석 행이 없는 매장을 예약 목록에서 제외한다.
- 입장 중 키오스크 세션 또는 타석 갱신 실패 시 새 access session과 현장 예약을 정리한다.
- 종료 중 타석 반납 실패 시 access session을 `overdue`로 복구해 다음 정리 주기에 재시도한다.
- 대시보드의 현재 이용 수는 종료 예정 시간이 남은 세션만 집계하고, 만료 세션은 `종료 확인`으로 분리한다.
- `현재 이용 중` 지표를 누르면 타석, 고객, 입장 경로, 시작·종료 예정, 세션 ID와 이용 종료 버튼을 확인할 수 있다.

## 확인된 남은 작업과 위험

1. 로컬 Supabase baseline이 없어 RLS·동시성·실제 DB 쓰기 흐름을 프로덕션과 분리해 자동 검증하기 어렵다.
2. GitHub Actions CI는 아직 없으며, 현재 검증 루프는 로컬 `npm run verify`로 실행한다.
3. Home Assistant 스케줄러를 매장 HA에 실제 적용하고 만료 반납·예약 사전 준비를 실증해야 한다.
4. 헤이홈 장비의 실제 Open API 제어와 전체 타석 기기 E2E 검증이 남아 있다.
5. Windows Agent 실기기 검증은 설치된 타석별로 다시 확인해야 한다.
6. 관리자 대시보드 자동 갱신은 15초 polling과 Supabase Realtime이 구현되어 있으므로 현장 회귀 테스트만 필요하다.
7. 입장·종료에 보상 처리를 추가했지만 완전한 DB 원자성은 아니므로 장기적으로 Postgres RPC 트랜잭션 전환을 검토한다.
8. 현재 관리자 인증은 Supabase 로그인 여부만 확인한다. 실 DB에 `public.users`/`store_users`가 없어 역할 검증을 바로 강제하면 기존 관리자도 잠길 수 있다. 관리자 역할 테이블 또는 `ADMIN_USER_IDS` 환경변수 도입 후 API·middleware 권한을 강화해야 한다.
9. 프로덕션 시흥점 A-02에는 2026-07-21 종료 예정이었던 키오스크 세션 1건이 `active`로 남아 있다. 사용자 승인 후 새 대시보드의 `이용 종료`로 정리한다.

## 작업 이력

| 날짜 | 작업자 | 변경·검증 | 상태 |
| --- | --- | --- | --- |
| 2026-07-25 | Codex | 공용 원장, `AGENTS.md`/`CLAUDE.md` 시작 규칙, `npm run preflight` 추가 및 실행 검증 | 완료 |
| 2026-07-25 | Codex | typecheck, lint, Windows Agent check, production build 기준선 통과 | 완료 |
| 2026-07-25 | Codex | `npm run verify` 자동 루프 추가, 정적 검사 4종과 HTTP 15종 통과 | 완료 |
| 2026-07-25 | Codex | 고객 매장 필터, 관리자 로그인 초기 화면, 입장·종료 실패 보상 처리 | 완료 |
| 2026-07-25 | Codex | 프로덕션 읽기 전용 조회로 A-02 과거 미종료 세션 확인, 현재 이용/종료 확인 분리와 상세 모달·정확한 세션 종료 구현 | 로컬 검증 완료, 배포 대기 |

## 완료 보고 형식

작업자는 완료 시 아래 항목을 이 문서에 추가한다.

```text
날짜 / 작업자:
목적:
변경 파일:
검증:
commit/push/deploy:
남은 문제:
```
