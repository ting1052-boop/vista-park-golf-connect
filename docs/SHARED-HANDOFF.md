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
| Codex | 완료·현장/DB/배포 대기 | A-02 현장 진단 기반 Agent 게임 상태 구조 개편: 설정 병합, ScreenGolf 프로세스·실시간 로그 상태 머신, 단일 실행 | Agent 0.6.0 설치 ZIP, 게임 감지 모듈·설정·테스트·문서, telemetry 계약, 본 원장 |
| Codex | 완료·현장 진단 대기 | Agent 로컬 게임 로그 진단 모드 추가: 홀·라운드 상태 단서 존재 여부만 안전하게 기록 | Agent 0.5.1 및 설치 ZIP, 설정/문서/테스트, 본 원장; 배포 없음 |
| Codex | 완료·DB 적용/배포 대기 | 골프 프로그램 상태 감지 MVP 구현: 프로세스 삼상값, 안전한 telemetry 저장, 관리자 대시보드 표시 | Agent 0.5.0, heartbeat/API, 신규 migration, 메인 대시보드, 본 원장 |
| Codex | 완료 | 골프 프로그램 상태 감지 구조 검토 및 계획서 작성만 수행 | `docs/agent-game-state-monitoring-plan.md`, 본 원장; 구현·배포 없음 |
| Codex | 완료 | 매장 종료 시 각 타석 Agent를 통한 Windows 정상 종료 명령 추가 | DB migration·GitHub·Vercel 배포 완료, 0.4.0 실기기 교체 대기 |
| Codex | 완료 | 대시보드 유령 이용 상태 원인 추적, 이용 상세·정확한 종료 조치 구현 | 커밋 `70b60f6`, Vercel 배포 및 A-02 과거 세션 정리 완료 |
| Codex | 완료 | 2번 타석 입장 시 장비 미기동 및 만료 세션 미반납 장애 진단 | HA 내부 자동화 정상, Nabu Casa 구독·원격연결 및 Vercel 비밀값 불일치가 외부 호출을 차단함 |
| Codex | 완료 | 2번 타석 자동화 순서를 프로젝터 ON 후 PC WOL로 변경 | 매장 HA에서 `projector ON → 15초 대기 → PC WOL` 저장·재조회 검증 완료 |
| Claude Code | 완료 | 대시보드 "무인 장비 상태" 표를 store_controller_commands 기반 실제 실행 상태로 교체, 미사용 mock 데이터 제거 | `src/lib/supabase/automation-status.ts`(신규), `src/app/admin/dashboard/page.tsx`, `dashboard-client.tsx`, `src/lib/dashboard-data.ts` |
| Claude Code | 완료 | 무인제어 화면의 타석 장비 OFF 버튼을 ON/OFF 토글로 전환(bay_on 액션 추가, 현재 상태 표시, 이용 중 타석 오조작 방지) | `src/app/api/admin/automation/route.ts`, `src/app/admin/automation/automation-client.tsx`, `src/lib/supabase/automation-status.ts` |
| Codex | 완료 | 자동 종료 로그 누락과 대시보드 오늘 예약 2건 집계 원인 점검 | Agent 종료 경로의 장비 반납 명령 누락 수정, 오늘 합계를 예약·입장으로 명확화 |
| Codex | 배포 완료·현장 반영 대기 | 키오스크·관리자 입장 공통 장비 ON 중단 진단 및 재발 방지 구현 | 커밋 `adb729a`, GitHub·Vercel 배포 완료; HA 노트북 제어기 업데이트·재등록 필요 |
| Codex | 완료·배포 대기 | 무인제어 운영 상태 감시 UI 및 타석별 PC 정상 종료 스위치 구현 | 로컬 화면·타입·대상 lint 검증 완료, 실제 종료 명령과 배포 미실행 |
| Claude Code | 완료·배포됨 | Codex 의 게임 상태 감지 0.6.0 커밋·배포, A-02 진단서 반영 수정(연습장 오집계·라운드 종료 보존·과거 로그 오인·heartbeat 지연), Agent 0.7.0 빌드 | `windows-agent/screen-golf-monitor.js`·테스트, `electron-main.js`, `package.json`; 커밋 `933cd3a`·`94b22cf`·`0eca1ac` |
| Claude Code | 완료·배포됨 | 예약 10분 전 타석 장비 자동 준비(제어기 조회 시점 실행, 켜져 있으면 생략) | `src/lib/reservation-prepare.ts`(신규), `src/app/api/automation/reservation-prepare/route.ts`, `src/app/api/store-controller/commands/route.ts`; 커밋 `fdcebeb` |
| Claude Code | 완료·배포됨 | 회원 예약 화면 카카오 로그인·시간대 선택 배포, `/api/member/book` 이용시간 화이트리스트 버그 수정 | `src/app/member/app/page.tsx`, `src/components/social-login-panel.tsx`, `src/app/api/member/*`; 커밋 `06c3cba` |
| Claude Code | 완료·배포됨 | 관리자 이용시간 조정을 실제 DB 반영으로 수정(기존 버튼은 화면만 바꿨음) | `src/app/api/admin/session/extend/route.ts`(신규), `dashboard-client.tsx`; 커밋 `5823ec0` |
| Claude Code | 미해결·결정 필요 | 카카오 KOE205 는 코드로 해결 불가(Supabase 가 scope 를 덧붙임). 카카오 콘솔 동의항목 설정 필요 | 시도 후 되돌림: 커밋 `126b532` → `3079aa1` |

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
9. 2026-07-25 프로덕션 시흥점 A-02에 남아 있던 2026-07-21 키오스크 세션을 승인 후 `completed`로 정리했다. 재검증 결과 활성 세션 0건, A-01/A-02/A-03 모두 `available`이다.

## 작업 이력

| 날짜 | 작업자 | 변경·검증 | 상태 |
| --- | --- | --- | --- |
| 2026-07-25 | Codex | 공용 원장, `AGENTS.md`/`CLAUDE.md` 시작 규칙, `npm run preflight` 추가 및 실행 검증 | 완료 |
| 2026-07-25 | Codex | typecheck, lint, Windows Agent check, production build 기준선 통과 | 완료 |
| 2026-07-25 | Codex | `npm run verify` 자동 루프 추가, 정적 검사 4종과 HTTP 15종 통과 | 완료 |
| 2026-07-25 | Codex | 고객 매장 필터, 관리자 로그인 초기 화면, 입장·종료 실패 보상 처리 | 완료 |
| 2026-07-25 | Codex | 프로덕션 읽기 전용 조회로 A-02 과거 미종료 세션 확인, 현재 이용/종료 확인 분리와 상세 모달·정확한 세션 종료 구현 | 커밋 `70b60f6`, GitHub push, Vercel 배포 완료 |
| 2026-07-25 | Codex | 사용자 승인 후 A-02 과거 세션 1건 완료 처리 및 타석 반납 | 활성 세션 0건, 시흥점 3개 타석 모두 available 확인 |

## 완료 보고 형식

### 2026-09-12 / Codex: 골프 상태 감지 계획서

- 목적: 실제 게임 프로세스·메뉴·홀·라운드 종료의 관찰 전용 감지 방안 검토.
- 변경 파일: `docs/agent-game-state-monitoring-plan.md`, 본 원장. 기존 다른 작업자의 변경 보존.
- 검증: Agent와 API/DB 정의 읽기, 첨부 설치폴더 단서 대조, 공식 기술문서 확인, 문서 diff 공백 검사. 실행 코드 변경이 없어 빌드/기능 테스트는 미실행.
- commit/push/deploy: 미실행. 운영 DB·기기 조작 없음.
- 남은 문제: 제품/버전과 실제 게임 실행파일, Logs의 상태 이벤트 제공 여부, 접근성·캡처 지원은 현장 확인 필요. 계획서의 감지 가능성은 아직 실증되지 않음.

### 2026-09-12 / Codex: 골프 상태 감지 MVP 구현

- 목적: 게임 실행 여부와 VISTA 이용 세션을 분리하고, 불확실한 게임 상태를 추측 없이 관리자 대시보드에 표시.
- 변경 파일: `windows-agent/electron-main.js`, `windows-agent/bays.config.json`, `windows-agent/agent.config.example.json`, `windows-agent/package.json`, `windows-agent/package-lock.json`, `windows-agent/README.md`, `src/lib/game-telemetry.ts`, `src/lib/agent-server.ts`, `src/app/api/agent/heartbeat/route.ts`, `src/lib/dashboard-data.ts`, `src/lib/supabase/bays-server.ts`, `src/app/admin/dashboard/dashboard-client.tsx`, `supabase/schema.sql`, `supabase/migrations/202609120001_agent_game_telemetry.sql`, 계획서, 본 원장.
- 동작: Agent 0.5.0은 감지가 명시적으로 활성화되고 정확한 실행파일명이 설정된 경우에만 프로세스 존재를 삼상값으로 관측한다. 메뉴·플레이·홀·라운드 종료는 근거가 없어 unknown으로 유지한다. 선택 telemetry 저장 실패는 기존 heartbeat·세션·장비 제어를 막지 않는다.
- 화면: 메인 대시보드 타석 카드에 `게임 감지 미지원`, `골프 프로그램 미실행`, `골프 프로그램 실행 · 플레이 확인 불가`, `게임 상태 확인 불가` 등의 보수적인 상태 행을 추가. 기존 DB에 migration이 없어도 이전 쿼리로 폴백한다.
- 검증: `npm run typecheck`, 대상 ESLint, `npm --prefix windows-agent run check`, `npm run build`, `npm run verify:quick` 통과. 로컬 대시보드에서 3열 카드와 상태 행을 시각 확인. 운영 DB·현장 PC·기기 조작 없음.
- commit/push/deploy: 미실행. `202609120001_agent_game_telemetry.sql` 운영 적용과 배포는 사용자 승인 대기.
- 남은 문제: 현장 게임 제품/버전과 실제 프로세스명 확인, `Logs`의 메뉴·홀·종료 이벤트 실증, 그 결과에 따른 2단계 감지기 선택. 정확한 프로세스 확인 전 `gameMonitoringEnabled`는 false 유지.

작업자는 완료 시 아래 항목을 이 문서에 추가한다.

```text
날짜 / 작업자:
목적:
변경 파일:
검증:
commit/push/deploy:
남은 문제:
```

## Current Work (2026-07-25, Codex)

- Status: completed
- Purpose: Compact the dashboard real-time bay cards and show three bays in one desktop row.
- Files: `src/app/admin/dashboard/dashboard-client.tsx`, `docs/SHARED-HANDOFF.md`
- Scope: UI layout only. No database, session, kiosk, or automation behavior changes.
- Verification: `npm run typecheck`, `npm run lint`, and `npm run build` passed.
- Commit/push/deploy: commit `ae10333`, GitHub push, and Vercel production deployment completed successfully.
- Agent check: A-02 (`VISTA-BAY-02`, version `0.3.0`) heartbeat was current at 2026-07-25 17:06 KST.

## Current Work (2026-08-11, Codex)

- Status: in progress
- Purpose: Add a store-local controller that polls Vercel for pending bay preparation commands, then calls the LAN-only Home Assistant instance. This avoids browser HTTPS-to-LAN mixed-content blocking and does not require exposing Home Assistant publicly.
- Planned files: controller package, server command API, database migration template, local configuration example, and operating guide.
- Safety: No production database migration, deployment, or physical device command will be run without the owner's confirmation.

## Home Assistant Sony Projector Integration (2026-08-10, Codex)

- Status: completed
- Purpose: Connect the Siheung bay 2 Sony VPL-PHZ60 projector to Home Assistant and the existing bay automation chain.
- Home Assistant changes: Enabled and verified Sony PJ Talk, allowed HA host `192.168.0.44`, added the legacy `sony_projector` switch for projector host `192.168.0.35`, validated configuration, and restarted HA.
- Entity: `switch.2beon_taseog_sony_peurojegteo` (verified state reporting and turn-on control).
- Script changes: `script.bay2_on` now runs PC Wake-on-LAN and projector ON; `script.bay2_off` turns the projector OFF while leaving PC shutdown to the Agent/operator flow.
- Verification: HA configuration check returned valid; the projector entity was created; `script.bay2_on` executed and the projector state changed to `on`.
- Repository files: documentation update only. HA configuration and scripts were changed on the store HA instance, not in the repository.
- Commit/push/deploy: not performed; no VISTA application code changed.
- Remaining work: Add projector entities and equivalent ON/OFF script actions for bays 1 and 3 after their network-control details are confirmed.

## Bay 2 Kiosk Automation Incident (2026-08-10, Codex)

- Status: diagnosed; external connectivity remediation is waiting for the owner to activate a Nabu Casa subscription and synchronize Vercel environment variables.
- Session: production Agent API confirmed a new A-02 active session created at `2026-08-10T05:33:55Z`, with a 30-minute end time.
- Equipment path: the kiosk/Vercel admission did not invoke `script.bay2_on`; its HA `last_triggered` timestamp remained older than the session start.
- HA local verification: direct invocation of `script.bay2_on` pressed `button.vista_2beontaseog` and changed `switch.2beon_taseog_sony_peurojegteo` to `on` after the projector startup delay. The HA-side script and devices are healthy.
- Nabu Casa finding: the HA Cloud UI shows `No subscription` and `cloud connection: disconnected`. WebSocket status reports `remote_enabled=true` but `remote_connected=false`, so no remote domain exists for Vercel.
- Secret mismatch: local `IOT_WEBHOOK_SECRET` and `CRON_SECRET` both received HTTP 401 from their production Vercel endpoints. Do not record secret values here; synchronize them in Vercel and the store HA only.
- Cleanup scheduler: the repository template exists, but no VISTA cleanup automation entity is active on HA. Install/enable it only after `CRON_SECRET` is synchronized; then verify the close-expired endpoint and a 5-minute automation run.
- Production DB safety: no session was force-closed during this diagnosis. The current active A-02 session was preserved.
- 2026-08-10 follow-up: user requested immediate end for bays 1 and 2. `script.bay1_off` and `script.bay2_off` were invoked directly on the store HA and both recorded a new trigger time. Database session completion still requires a logged-in administrator path because the local Supabase admin key returned 401.
- 2026-08-10 projector startup order: updated store HA `script.bay2_on` through the HA configuration API. The verified sequence is Sony projector ON, 15-second delay, then `button.vista_2beontaseog` (PC WOL). No repository application code or production database record was changed.

## Store-local Controller Preparation (2026-08-11, Codex)

- Status: implementation complete; production activation is pending owner approval.
- Purpose: remove the Vercel-to-private-LAN Home Assistant dependency for kiosk and administrator bay preparation. The HA Windows laptop polls Vercel, then calls its local HA address.
- Added: `store_controller_commands` queue migration, authenticated Vercel command endpoint, kiosk enqueue path guarded by `STORE_CONTROLLER_ENABLED=true`, and a Windows PowerShell controller package under `store-controller/`.
- Safety: the controller configuration file is Git-ignored. No actual token, HA token, production migration, Vercel environment update, deployment, or device command was performed.
- Verification: `npm run typecheck` passed; targeted ESLint passed for changed TypeScript files; PowerShell parser passed for `store-controller/vista-store-controller.ps1`. Full repository lint could not enumerate an existing inaccessible `.tmp_pysdcp` folder.
- Activation order: deploy code, run `202608110001_store_controller_commands.sql` in Supabase, set `STORE_CONTROLLER_ENABLED=true` and a new `STORE_CONTROLLER_TOKEN` in Vercel Production, redeploy, configure and start the controller on the HA Windows laptop, then perform one A-02 kiosk test.

## Current Work (2026-08-11, Codex)

- Status: completed, awaiting owner approval for production activation.
- Files: `src/lib/store-controller.ts`, `src/app/api/store-controller/commands/route.ts`, `src/lib/kiosk.ts`, `store-controller/`, `supabase/migrations/202608110001_store_controller_commands.sql`, `supabase/schema.sql`, `.env.local.example`, `.gitignore`.
- No production operations were executed.

## Current Work (2026-08-15, Codex)

- Status: implementation and verification completed; owner approved GitHub push and Vercel deployment
- Purpose: Replace the display-only admin automation controls with authenticated, live session cleanup and store-controller command actions.
- Files: `src/app/admin/automation/page.tsx`, `src/app/admin/automation/automation-client.tsx`, `src/app/api/admin/automation/route.ts`, `src/lib/store-controller.ts`, `src/lib/session-cleanup.ts`, `supabase/migrations/202608150001_store_controller_release_commands.sql`, `docs/SHARED-HANDOFF.md`.
- Behavior: The automation page now reads real active sessions and automation logs. It can request expired-session cleanup and queue shared ON/OFF requests through the store-local controller. Session closeout queues a `release_bay` command when the controller is enabled, avoiding Vercel-to-LAN Home Assistant calls.
- Verification: `npm run typecheck` passed. Targeted ESLint for changed files passed. Full `npm run lint` remains blocked by an existing inaccessible `.tmp_pysdcp` folder. No local server was running for HTTP verification.
- Release note: GitHub push triggers the configured Vercel deployment. Before using the new 종료 정리 or 공용 ON/OFF actions, run `supabase/migrations/202608150001_store_controller_release_commands.sql` in the Supabase SQL Editor. No physical device command was performed during this implementation.

## Current Work (2026-08-15, Codex - automation log compatibility fix)

- Status: completed; ready to deploy
- Purpose: Prevent `/admin/automation` from failing when the optional `automation_logs` table is absent, and use the database's available log source when compatible.
- Files: `src/app/api/admin/automation/route.ts`, `docs/SHARED-HANDOFF.md`.
- Resolution: The page now reads recent control history from the existing `store_controller_commands` table instead of the absent `automation_logs` table. No schema change is required for this compatibility fix.
- Verification: `npm run typecheck` and targeted ESLint passed.
- Safety: no production database write or physical device command.

## Current Work (2026-08-15, Codex - per-bay manual equipment control)

- Status: completed; ready to deploy and owner-test
- Purpose: Show each bay's Agent connection separately from customer usage, and allow an administrator to queue a safe per-bay HA OFF script even when no access session exists.
- Files: `src/app/admin/automation/automation-client.tsx`, `src/app/api/admin/automation/route.ts`, `docs/SHARED-HANDOFF.md`.
- Behavior: The automation API now returns bay Agent heartbeat status and accepts an authenticated `bay_off` action. The operator UI shows each bay separately and queues its mapped `bayN_off` HA script after confirmation, even without an access session.
- Verification: `npm run typecheck` and targeted ESLint passed.
- Safety: this action queues the configured HA `bayN_off` script only. It does not hard-cut PC power or modify usage sessions. The dirty `windows-agent/electron-main.js` owned by another task will not be edited.

## Current Work (2026-08-15, Codex - store closing action)

- Status: completed; ready to deploy and owner-test
- Purpose: Replace the public-facing shared OFF action with a guarded store-closing action that queues every mapped bay OFF script followed by the shared lighting/HVAC OFF script.
- Files: `src/app/admin/automation/automation-client.tsx`, `src/app/api/admin/automation/route.ts`, `docs/SHARED-HANDOFF.md`.
- Behavior: `store_close` refuses to run while any active/extended/overdue session remains. Otherwise it queues `bay1_off`, `bay2_off`, `bay3_off`, then `shared_off` in order through the store-local controller.
- Verification: `npm run typecheck` and targeted ESLint passed.
- Safety: the API refuses store closing while active/extended/overdue sessions exist. PC mains power is not hard-cut; graceful Agent shutdown remains a separate Agent release.

## Current Work (2026-08-15, Codex - graceful PC shutdown on store close)

- Status: implementation, migration, GitHub push, and Vercel deployment completed. Bay-PC Agent replacement remains.
- Purpose: Make `매장 종료` shut down recently connected bay PCs through their Windows Agents, in addition to the existing HA bay/shared OFF scripts.
- Files: `src/lib/store-controller.ts`, `src/app/api/store-controller/commands/route.ts`, `src/app/api/admin/automation/route.ts`, `src/app/api/agent/session/route.ts`, `src/app/api/agent/command-result/route.ts`, `src/app/admin/automation/automation-client.tsx`, `windows-agent/electron-main.js`, `windows-agent/package.json`, `windows-agent/package-lock.json`, `supabase/schema.sql`, `supabase/migrations/202608150002_store_close_agent_shutdown.sql`.
- Behavior: only Agents seen within two minutes receive `shutdown_pc`; the store controller ignores Agent-only commands; an Agent acknowledges its own command and schedules normal Windows shutdown after ten seconds. Commands older than five minutes are cancelled so a PC cannot shut down unexpectedly on a later boot.
- Verification: `npm run typecheck`, targeted ESLint, `npm --prefix windows-agent run check`, and `npm run build` passed. The first sandboxed build attempts hit Windows `spawn EPERM`; the approved production build passed. Electron Builder produced an updated `win-unpacked` app but portable single-file packaging stopped at the known Windows symlink privilege issue. A local install ZIP was created from the valid unpacked app at `windows-agent/dist/VISTA-Bay-Agent-0.4.0-install.zip`.
- Safety: the owner ran the migration in Supabase; Codex did not write production data or send a physical shutdown command. The existing uncommitted warning-window height change (`440` to `480`) was preserved in the rebuilt Agent.
- Release: commit `65bf626` was pushed to `main`. Production deployment was verified because unauthenticated `POST /api/agent/command-result` returns `401` instead of `404`. No physical shutdown command was sent during verification.

## Current Work (2026-08-15, Codex - member reservation UX and Kakao login)

- Status: implementation and local verification completed; Kakao provider setup, commit, and deployment are pending.
- Purpose: Reduce the number of visible mobile reservation time buttons with period-based selection, repair the Korean social-login UI, and connect the supported Kakao OAuth flow to the member reservation page.
- Planned files: `src/app/member/app/page.tsx`, `src/components/social-login-panel.tsx`, `src/lib/auth/social-login.ts`, related auth/member API files if needed, and this handoff.
- Safety: No production database write, schema migration, deployment, or secret handling will occur without owner confirmation. Existing unrelated dirty files will be preserved.
- Preflight: `npm run preflight` was attempted but the sandbox blocked its internal `git` process with `spawnSync git EPERM`; handoff and git status were checked manually.
- Changes: Mobile reservation times are grouped into morning/afternoon/evening tabs; elapsed and business-closed slots are hidden. Kakao OAuth is the only supported social button. Kakao members are linked through `members.login_provider/provider_subject`, so the current production table does not require an `auth_user_id` column. Authenticated bookings use a server route and the member view shows only that account's reservations.
- Verification: 390x844 browser review passed for layout and period switching; browser console had no warnings or errors. `npm run typecheck`, targeted ESLint, and `npm run build` passed. The sandboxed build first hit `spawn EPERM`; the approved build completed all 45 routes.
- Commit/push/deploy: not performed. Wait until the owner creates and configures the Kakao Developers app and Supabase Kakao provider so the production login button is not released in an inactive state.

## Review, Commit & Deploy (2026-08-11, Claude)

- Reviewed the store-controller implementation: approved. Auth uses `timingSafeEqual`; the poll endpoint claims commands atomically with a lease and recovers expired leases; completion verifies `controller_id`; enqueue is idempotent via `unique(access_session_id, command_type)`; kiosk enqueues instead of calling HA directly when `STORE_CONTROLLER_ENABLED=true`, which removes the "장비 켜기 실패" message. `controller.config.json` is confirmed Git-ignored.
- Verified: `npm run typecheck` passed on the full tree.
- **Committed and deployed** the feature: commit `d81bc89`, pushed to `main`, Vercel deploy confirmed (`GET /api/store-controller/commands` returns 401 in production). Feature is inert until `STORE_CONTROLLER_ENABLED=true`, so no behavior change yet.
- Owner-pending (dashboard access required, Claude cannot perform these): (1) run `202608110001_store_controller_commands.sql` in the Supabase SQL Editor — do migration BEFORE enabling; (2) set `STORE_CONTROLLER_TOKEN` and `STORE_CONTROLLER_ENABLED=true` in Vercel Production, then redeploy. A token was generated in chat; the same value must go in Vercel and the controller config. Do not record the value here.
- → Codex next tasks (HA Windows laptop, always-on):
  1. Create `store-controller/controller.config.json` from the example: `controllerId`, `apiBaseUrl=https://vista-park-golf-connect.vercel.app`, `controllerToken` (same value the owner sets in Vercel), `homeAssistantUrl=http://192.168.0.44:8123`, `homeAssistantToken`, `pollIntervalSeconds=5`. Test with `start-controller.cmd`, then register boot auto-start with `install-startup.ps1`. Keep it running on the always-on HA laptop.
  2. Finish HA scripts for full coverage (bay 2 already done): connect bay 1 and bay 3 projectors and add `script.bay1_on/off`, `script.bay3_on/off`, and `script.shared_on/off` using the exact names in `src/lib/automation/device-map.ts`. Until `shared_on/off` exist, the controller will call them as no-ops (HA returns 200).
  3. After the owner enables, run one A-02 kiosk entry and confirm: command is claimed (status `processing`), `script.bay2_on` runs (projector → 15s → WOL), the controller POSTs `succeeded`, and an `automation_logs` row is recorded.
- Minor non-blockers noted for later: a command exceeding the `attempts` cap (20) can stick as pending (add a max-attempts → `failed` transition); the poll endpoint returns pending commands across all stores (fine for the single Siheung store, scope by store if multi-store is added).

## Dashboard Automation Status + Mock Cleanup (2026-08-15, Claude Code)

- Status: completed.
- Purpose: the dashboard "무인 장비 상태" table was hardcoded (`automationDeviceRows`) and always showed fixed text like "대기"/"테스트 가능" while claiming to show the current state. Replaced with real per-bay power state derived from actual automation runs.
- Source of truth: `store_controller_commands.response_payload.steps[]` (per-script ok/fail) plus `completed_at`. For each bay the newest of `bayN_on` / `bayN_off` decides ON/OFF; a failed newest run surfaces as "켜기/끄기 실패 · 확인 필요".
- **Production finding: `public.automation_logs` does not exist in the production database** (also missing: `automation_devices`, `automation_scenes`). Verified read-only via PostgREST: `PGRST205 Could not find the table`. Consequences:
  - Every `automation_logs` insert silently fails today — `src/lib/automation/sessions.ts` (runStep), `src/app/api/store-controller/commands/route.ts`, `src/app/api/automation/reservation-prepare/route.ts`. The intended automation audit trail is not being persisted.
  - This is why the new status view reads `store_controller_commands` instead.
  - Not fixed here: creating the table is a production DDL change and needs the owner's approval. Either apply the missing part of `supabase/schema.sql`, or remove the dead inserts.
- Also removed about 180 lines of unused mock data from `src/lib/dashboard-data.ts` (`liveBayRows`, `adminAlertRows`, `noShowRows`, `entryCheckRows`, `accessSessionRows`, `automationDeviceRows`, `automationLogRows`, `showroomAutomationScenarios`, `reservationRows`, `storeSummaryRows`, `operations`). All verified unreferenced. This also removes fake customer name/phone strings from the source tree, which matters because the copyright submission package ships the source. Kept: `adminNavItems`, `quickActions`, `featureChecks`, and all exported types.
- Verification: `npm run typecheck`, `npm run lint`, `npm run build` all pass. Logic additionally replayed against real production `store_controller_commands` (12 commands, 7 scripts recognized): all bays and 공용 resolved to "OFF (대기)" at 2026-08-15T12:31:10, matching the actual store close run (`bay1_off, bay2_off, bay3_off, shared_off` all OK at 12:31:04).
- Not changed: the "무인 운영 1차 MVP 범위" panel still renders the static `featureChecks` list. It is project-scope copy rather than operational data, so replacing it is a product decision.

## Bay Equipment ON/OFF Toggle (2026-08-21, Claude Code)

- Status: completed.
- Purpose: `/admin/automation` only had a one-way "타석 장비 OFF" button, so an operator could turn a bay off but never back on from that screen, and the card never showed whether the equipment was currently on. Replaced with a real ON/OFF toggle.
- Shared state source: extracted `getLatestScriptRuns()` and `getPowerState()` in `src/lib/supabase/automation-status.ts` so the dashboard status table and this toggle agree on what "ON" means (newest of `bayN_on` vs `bayN_off` in `store_controller_commands`).
- API (`/api/admin/automation`):
  - GET now returns `powerOn` (`true`/`false`/`null` when no history), `powerFailed`, `powerLastRunAt`, and `inUse` per bay.
  - POST accepts the new `bay_on` action (runs `mapping.enterScript`); `bay_off` unchanged in effect.
  - **Safety guard added**: `bay_off` on a bay with an active/extended/overdue session now returns 409 with `requiresForce: true` instead of firing immediately. The client asks a second explicit confirmation and retries with `force: true`. Previously a single confirm could cut power to a bay a customer was using — more likely to be hit by accident now that it is a one-click toggle.
- UI: toggle switch shows 장비 ON / 장비 OFF / 켜기·끄기 실패 plus the last run time, spinner while the command is queued, and an amber "고객 이용 중" warning line on bays with a live session. Bays without automation mapping or with the controller disabled stay disabled.
- Verification: `npm run typecheck`, `npm run lint`, `npm run build` all pass. Not visually verified in the running app — the automation page requires an admin session and this environment's browser tool cannot capture screenshots, so the owner should eyeball the toggle once.
- Known limitation (unchanged by this work): the state is inferred from the last command we sent, not read back from the devices. If a projector is switched off by its physical remote, the toggle will still show ON until the next command runs.

## Kiosk Walk-in Button Responsiveness (2026-08-21, Claude Code)

- Status: completed.
- Reported symptom: on `/kiosk/entrance`, "예약하고 왔어요" switches screens instantly but "바로이용" feels slow after tapping.
- Root cause: the reservation button only calls `setScreen("phone")` (local state), while the walk-in button awaited `/api/kiosk/bays` and called `setScreen("walkin-bay")` **only after the response arrived**. The home screen rendered no loading indicator during that wait, so the kiosk looked frozen.
- Measured production latency for `POST /api/kiosk/bays`: 1.2–1.5s in the first sample set, and 0.49–2.1s across later samples. Latency is highly variable, so this path cannot be made reliably fast — the UI must not block on it.
- Changes:
  - Walk-in button switches the screen immediately, then loads bays in the background.
  - The bay grid shows a loading placeholder while fetching. Previously an empty "표시할 타석이 없습니다" state could flash before data arrived.
  - Bay data is prefetched while the kiosk idles on the home screen, so the tap usually renders instantly and refreshes quietly afterwards. Stale prefetch is safe: walk-in start re-validates availability and already returns a clear 409 message if the chosen bay was taken.
  - `listBaysWithAvailability` now issues the independent `bays` and `reservations` queries with `Promise.all` instead of sequentially, removing one DB round trip.
- Verification: `npm run typecheck`, `npm run lint`, `npm run build` pass; deployed and re-measured the endpoint. The parallel query removes a round trip, but serverless variance dominates the numbers, so no specific speedup figure is claimed. Not verified on the physical kiosk tablet — the owner should confirm the perceived responsiveness there.

## Current Work (2026-08-16, Codex - Agent expiry release log)

- Status: implementation and local verification completed; owner approved a scoped commit and deployment.
- Production read-only finding: today's dashboard count of two consists of one `member_app` reservation and one completed administrator walk-in. The existing metric intentionally counts all non-cancelled reservations and entries whose start time is today, including completed rows.
- Production read-only finding: the administrator walk-in session completed normally, but no `release_bay` or `shutdown_pc` command was created at its expiry. The PC being off therefore was not caused by a recorded VISTA shutdown command.
- Root cause: `POST /api/agent/session/end` called the shared session closeout with `runAutomation: false`, so it completed the session and released the bay in the database while suppressing the local-controller equipment release command.
- Resolution: the Agent expiry endpoint now uses the same idempotent `closeSingleSession` automation path as admin/cron closeout, allowing a `release_bay` command and visible `타석 이용 종료` log to be created. Normal session expiry does not enqueue `shutdown_pc`; graceful PC shutdown remains a guarded `매장 종료` action.
- UI: dashboard KPI and mini status labels now say `오늘 예약·입장`, matching the existing calculation and its app versus walk-in/phone breakdown.
- Files: `src/app/api/agent/session/end/route.ts`, `src/app/admin/dashboard/dashboard-client.tsx`, `docs/SHARED-HANDOFF.md`.
- Verification: `npm run typecheck` and targeted ESLint passed. Full `npm run lint` remains blocked by the existing inaccessible `.tmp_pysdcp` folder. No production database write or physical device command was performed; the owner approved the scoped GitHub/Vercel release.

## Current Work (2026-08-28, Codex - Store Controller outage recovery)

- Status: scoped release completed in commit `adb729a`; GitHub push and Vercel production deployment succeeded. HA-laptop installation remains the field step.
- Production read-only finding: kiosk and administrator admission both create `prepare_bay` commands correctly. There are 21 `pending`/`processing` equipment commands with zero processing progress, ranging from 2026-08-19 through 2026-08-27. The last successful command by `vista-siheung-controller` completed on 2026-08-19 KST. This proves the shared failure is the stopped store-local controller, not either admission screen.
- Production read-only finding: one access session is still active after its end time, consistent with the HA-laptop scheduler also not running.
- Server safety: controller polling now cancels pending or abandoned processing commands older than 15 minutes, fails commands that exhausted 20 attempts, and never returns stale commands to the HA laptop. This prevents an old ON/OFF backlog from executing after a reboot.
- Admin UI: `/admin/automation` separately checks all pending/processing controller commands. A command waiting more than 30 seconds shows `매장 제어기 응답 없음`, displays the queue age/count, and disables new equipment commands instead of incorrectly saying the controller is connected.
- HA laptop reliability: the startup installer now registers a SYSTEM task at Windows startup, restarts it after failure, permits battery operation, starts it immediately, and the controller writes a rotating `controller.log` with throttled connection errors and recovery messages.
- Files: `src/app/api/store-controller/commands/route.ts`, `src/app/api/admin/automation/route.ts`, `src/app/admin/automation/automation-client.tsx`, `store-controller/install-startup.ps1`, `store-controller/vista-store-controller.ps1`, `store-controller/README.md`, `docs/SHARED-HANDOFF.md`.
- Verification: `npm run typecheck`, targeted ESLint, PowerShell parser checks for both scripts, `git diff --check`, and the full `npm run build` (46 routes) passed. No production device command was performed during local verification.
- Safe recovery order: deploy server safeguards first; then update/reinstall and start the HA-laptop controller; confirm stale commands become cancelled; run `이용 종료 정리` for the expired session; finally perform one fresh bay-ON admission test.
- Deployment verification: GitHub reported the Vercel check as `success`; the production Store Controller endpoint returned HTTP 401 for an intentionally invalid bearer token, confirming the route is online and protected. The local machine does not store the production controller token, so stale-command cancellation will run automatically on the HA laptop's first authenticated poll.

## Current Work (2026-09-01, Codex - Operations status clarity)

- Status: implementation and local verification completed; commit and deployment not performed.
- Purpose: remove the misleading contradiction where the dashboard showed a live PC while `/admin/automation` showed `장비 OFF` from an older command.
- Resolution: PC state is now shown separately from equipment automation. A recent Agent heartbeat is labeled `PC 켜짐`; a missing heartbeat is conservatively labeled `PC 확인 안 됨`. Equipment cards say `마지막 장비 명령 ON/OFF` and explicitly explain that this is controller command history, not physical read-back.
- PC control: the card switch now follows the Agent heartbeat instead of the last HA command. Switching an online PC off queues a bay-specific `shutdown_pc` command for the Agent, which performs a guarded Windows shutdown after ten seconds. Switching an unconfirmed/offline PC on uses the existing projector-first `bay_on` path. Projector and other bay equipment keep separate ON/OFF command buttons.
- Safety: per-bay shutdown is refused when the Agent is offline. An active/extended/overdue customer session requires a second force confirmation before the shutdown command is queued. Duplicate shutdown requests within five minutes reuse the existing command.
- Monitoring UI: added a 15-second auto-refreshing health banner and compact summaries for controller availability, pending/stale commands, connected PC Agents, and active/expired sessions. An active session without an Agent heartbeat, a failed equipment command, a stalled/disabled controller, or an expired session contributes to the visible issue count.
- Dashboard wording: the equipment table is now titled `무인 장비 마지막 명령`, and stale Agent state no longer claims that a PC is definitely off.
- Files: `src/app/admin/automation/automation-client.tsx`, `src/app/api/admin/automation/route.ts`, `src/app/admin/dashboard/dashboard-client.tsx`, `src/lib/store-controller.ts`, `src/lib/supabase/automation-status.ts`, `docs/SHARED-HANDOFF.md`.
- Verification: local `/admin/automation` rendered against the configured data with no browser console errors. A-02 visibly showed `PC 켜짐` alongside `마지막 장비 명령 OFF`; its PC switch had `aria-checked=true` and was enabled for normal shutdown. TypeScript, targeted ESLint, and diff checks passed.
- Safety: no production database write, schema change, deployment, or physical device command was performed.

## Agent Game Log Diagnostic Probe (2026-09-12, Codex)

- Status: implementation, tests, and local packaging completed; one-bay field diagnosis is pending.
- Purpose: determine whether the installed golf program exposes reliable hole-number or round-end evidence in local text logs before promoting any value to an operational dashboard status.
- Agent behavior: version 0.5.1 watches the configured `Logs` directory every 10 seconds. Its first scan establishes a baseline and ignores old content. Later scans inspect at most 32 KB of changed text and record only candidate categories (`hole_candidate`, `round_start_candidate`, `round_end_candidate`, `menu_candidate`) plus candidate hole numbers.
- Privacy and isolation: raw log text, file names, full paths, screenshots, and customer data are not recorded or uploaded. Results remain only in `%APPDATA%\VISTA Bay Agent\logs\game-monitor-diagnostics.log`. Probe failures cannot block reservation, session timing, overlays, heartbeats, or equipment automation.
- Truth policy: these candidates do not set `currentHole`, `gameState`, or `roundStatus` yet. A field sequence must repeatedly match the visible game screen before a parser can be promoted. Unknown or conflicting evidence remains `확인 불가`.
- Files: `windows-agent/game-log-probe.js`, `windows-agent/game-log-probe.test.js`, `windows-agent/electron-main.js`, Agent config/package/README files, `docs/agent-game-state-monitoring-plan.md`, and this handoff.
- Verification: Agent syntax/check suite passed with two probe tests; targeted ESLint, project typecheck, `git diff --check`, packaged version inspection, and packaged module inspection passed.
- Package: `windows-agent/dist/VISTA-Bay-Agent-0.5.1-game-diagnostics.zip` contains the verified 0.5.1 `win-unpacked` application. The single portable-EXE target did not replace the older EXE because of the existing Windows packaging/signing limitation; do not distribute the stale `dist/VISTA-Bay-Agent.exe` as 0.5.1.
- Field procedure: install 0.5.1 on one test bay, start Agent before the golf program, then pause at menu, hole 1, another hole, and round completion for at least 10 seconds each. Retrieve only `game-monitor-diagnostics.log` for analysis.
- Commit/push/deploy/database: not performed. No production data or physical device commands were used.

## ScreenGolf State Monitor 0.6.0 (2026-09-15, Codex)

- Evidence quality: the input handoff was produced by Codex running directly on the physical A-02 ScreenGolf PC while the operator exercised lobby, course entry, holes 2-18, the last hole, lobby return, and process exit. Treat the confirmed executable paths and log patterns as field evidence, not a filename guess.
- Resolution: bundled public defaults and ignored local secrets are now merged. This prevents an older local config from silently disabling new monitoring defaults. The verified process is `ScreenGolf.exe` and the readable state log is `ScreenGolf\Saved\Logs\ScreenGolf.log`.
- Live state machine: process absence reports program not running; `BP_LobbyModebase_C`/`UIMap` reports menu; `SGGameModeBase_C`/course Browse reports round in progress. Returning from a round to the lobby remains unclassified because the readable log does not yet distinguish normal completion from early exit.
- Hole/end policy: locked `Binaries\Win64\Logs\main_*.log` is diagnostic-only. When it becomes readable after play, `NNhole` and `IsEndedHole ... State: 1` candidates are recorded locally but never presented as a live current hole or confirmed completion.
- Reliability: added a single-instance lock, sanitized state-transition diagnostics, throttled heartbeat/telemetry rejection logging, and a repeatable Windows directory build that avoids the existing signing symlink failure.
- Files: `windows-agent/agent-config.js`, `windows-agent/screen-golf-monitor.js` and tests, `windows-agent/game-log-probe.js` and tests, `windows-agent/electron-main.js`, configs/package/README, `src/lib/game-telemetry.ts`, `docs/agent-game-state-monitoring-plan.md`, `docs/park-golf-pc-round-end-diagnostic-prompt.md`, and this handoff.
- Verification: Agent check suite passed 5 tests; targeted ESLint, project typecheck, and `git diff --check` passed. `npm run dist` completed successfully with the new Windows directory target. Packaged asar version/module inspection passed.
- Package: `windows-agent/dist/VISTA-Bay-Agent-0.6.0-screen-golf-monitor.zip`.
- Remaining field investigation: use `docs/park-golf-pc-round-end-diagnostic-prompt.md` on A-02 to compare normal final-hole completion with an early lobby exit. Do not promote a completion regex without a distinguishing live signal. Real-time hole display remains unavailable unless the vendor exposes an unlocked log/API/state file or a separately validated local OCR adapter is added.
- Commit/push/deploy/database: the earlier observation-only telemetry foundation is already in `origin/main` as commit `933cd3a`; this 0.6.0 field-evidence revision is not committed or deployed. Production DB migration application and dashboard receipt still need explicit verification/approval before field rollout.

## Release + Field Fixes (2026-09-12 ~ 09-15, Claude Code)

Codex 의 0.6.0 항목은 "not committed or deployed" 로 적혀 있으나 그 이후 커밋·배포했다.
아래는 그 이후 진행분 전체다. 커밋 순서대로 적는다.

### 배포한 것

| commit | 내용 |
| --- | --- |
| `933cd3a` | Agent 게임 상태 감지(관찰 전용) 일체 + `game_telemetry` 마이그레이션 + 대시보드 표시 |
| `1f05bbb` | 대시보드 게임 상태 줄 확대(12px→16px) |
| `8584c26` | `install-startup.ps1` 이 포터블 exe 도 지원 |
| `06c3cba` | 회원 예약 화면 카카오 로그인·시간대 선택 + `/api/member/book`, `/api/member/my-reservations` |
| `3079aa1` | 카카오 scope 수정 시도 되돌림(아래 참조) |
| `fdcebeb` | 예약 10분 전 타석 장비 자동 준비 |
| `94b22cf` | Agent 게임 상태 감지 수정(A-02 진단서 반영) |
| `0eca1ac` | Agent 0.7.0 |

- 운영 DB: `game_telemetry` / `game_telemetry_received_at` 는 사용자가 적용 완료했다(조회로 확인).
  `202608210001_store_duration_options.sql`, `202608210002_walkin_request_idempotency.sql` 는 적용 여부 미확인.

### Codex 가 알아야 할 판단 두 가지

1. **카카오 KOE205 는 코드로 못 고친다.** 클라이언트에서 `signInWithOAuth({ options: { scopes } })`
   를 줘도 Supabase 는 기본 scope 를 **대체하지 않고 뒤에 덧붙인다.** 배포본에서 실제로 나간 값은
   `account_email profile_image profile_nickname profile_nickname` 이었다(브라우저에서 인가 URL 직접 확인).
   `account_email` 이 남아 KOE205 가 유지되므로, 해결은 카카오 개발자 콘솔에서 닉네임·프로필 사진·
   카카오계정(이메일) 동의항목을 사용으로 설정하는 쪽이다. 같은 수정을 다시 시도하지 말 것.

2. **예약 사전 준비의 실행 주체는 매장 제어기다.** 기존 `reservation-prepare` 는 Vercel 에서
   Home Assistant 를 직접 호출했다. 클라우드에서 매장 사설망에 닿을 수 없어 실행되면 항상 실패하는
   코드였고, 존재하지 않는 `automation_logs` 에 기록하려 했다. 새 `src/lib/reservation-prepare.ts` 는
   제어기 명령을 큐에 넣고, 호출 시점은 제어기가 `/api/store-controller/commands` 를 조회할 때다.
   `vercel.json` 이 비어 있어 cron 을 쓸 수 없으므로 상시 켜진 제어기를 스케줄러로 삼았다.
   이미 켜져 있는 타석에는 명령을 넣지 않는다(램프 수명). 중복 방지는
   `reservations.automation_prepare_status` 선점으로 한다.

### Agent 진단서(2026-09-15 A-02) 반영 결과

고친 것: 연습장 오집계(맵 이름으로 판별, `Practice_`/`Tutorial_`/`Test_` 제외. `SGGameModeBase_C` 는
연습장과 공용이라 단독으로 라운드를 만들지 않음), 중복 `lobby_entered` 가 종료 상태를 덮던 문제
(`completed` 확정 후 다음 `round_entered` 까지 유지), `exit_requested` 상태 전이(라운드 중 종료는
`aborted`), 시작 시 과거 로그 오인(첫 조회는 파일 끝을 기준점으로), `tick()` 의 telemetry 미대기.

이미 되어 있던 것: heartbeat 의 비정상 HTTP 응답 기록은 `recordHeartbeatResult` 에 이미 있었다.
진단서 P0-5 는 현재 코드에 해당하지 않는다.

하지 않은 것: `currentHole` 은 실행 중 잠기는 native 로그에만 있어 게임 측 상태 출력 없이는 만들 수
없다. 라운드 수 집계(`roundInstanceId`, `round_ended` 이벤트, 서버 테이블, UNIQUE 제약)는 새 기능이라
이번 범위에서 제외했다. 진단서 P2-1(포터블 exe 안에 타석 토큰 포함)도 손대지 않았다.

### 함께 고친 운영 버그

- `/api/member/book` 이 허용 이용시간을 `[30, 70, 110, 150]` 으로 코드에 박아두고 있었다. 서비스 시간을
  90분 15분·120분 20분으로 바꾼 뒤 화면은 105·140 분을 보내므로 **90분과 120분 예약이 항상 거절**되는
  상태였다. 관리자 요금설정에서 허용 길이를 가져오도록 바꿨다.
- 대시보드 "30분 연장" 버튼이 화면 상태만 바꾸고 DB 를 건드리지 않아, 15초 새로고침 때 되돌아갔다.
  연장용 서버 API 자체가 없었다. `/api/admin/session/extend` 를 만들어 실제로 반영되게 했다(`5823ec0`).

### 남은 문제 (미해결, 확인 필요)

- `vercel.json` 이 `{}` 다. `/api/cron/close-expired-sessions` 가 **아무도 호출하지 않는다.**
  시간 종료 세션 자동 정리가 동작하지 않는 상태다. 예약 사전 준비와 같은 방식으로 제어기 조회에
  붙일지, Vercel cron 을 등록할지 정해야 한다.
- `automation_logs` / `automation_devices` / `automation_scenes` 는 여전히 운영 DB 에 없다.
  `src/lib/automation/sessions.ts` 등의 insert 는 계속 조용히 실패한다.
- 타석 PC 시작프로그램 등록이 되어 있지 않다. 매장 오픈으로 재부팅되면 Agent 가 뜨지 않아
  남은 시간 표시와 게임 감지가 모두 멈춘다. 2026-09-15 기준 A-01 은 46시간, A-03 은 60시간 신호 없음.
- 회원 화면 정리 3건(`docs/codex-spec-member-ui-phase1.md`)은 스펙만 있고 미구현이다.
  관리자 링크 삭제, 예약자 정보 위치 이동, 비로그인 시 예약 현황 숨김 — 수용 기준 전부 미충족 상태.

### 작업트리에 남겨둔 것 (커밋하지 않음)

무인제어 정리 작업으로 보이는 변경을 그대로 뒀다. 내 작업과 섞지 않으려고 건드리지 않았다.
`src/lib/store-controller.ts`, `src/lib/supabase/automation-status.ts`,
`src/app/admin/automation/automation-client.tsx`, `src/app/api/admin/automation/route.ts`.
