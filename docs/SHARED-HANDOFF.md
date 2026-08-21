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
| Codex | 완료 | 매장 종료 시 각 타석 Agent를 통한 Windows 정상 종료 명령 추가 | DB migration·GitHub·Vercel 배포 완료, 0.4.0 실기기 교체 대기 |
| Codex | 완료 | 대시보드 유령 이용 상태 원인 추적, 이용 상세·정확한 종료 조치 구현 | 커밋 `70b60f6`, Vercel 배포 및 A-02 과거 세션 정리 완료 |
| Codex | 완료 | 2번 타석 입장 시 장비 미기동 및 만료 세션 미반납 장애 진단 | HA 내부 자동화 정상, Nabu Casa 구독·원격연결 및 Vercel 비밀값 불일치가 외부 호출을 차단함 |
| Codex | 완료 | 2번 타석 자동화 순서를 프로젝터 ON 후 PC WOL로 변경 | 매장 HA에서 `projector ON → 15초 대기 → PC WOL` 저장·재조회 검증 완료 |
| Claude Code | 완료 | 대시보드 "무인 장비 상태" 표를 store_controller_commands 기반 실제 실행 상태로 교체, 미사용 mock 데이터 제거 | `src/lib/supabase/automation-status.ts`(신규), `src/app/admin/dashboard/page.tsx`, `dashboard-client.tsx`, `src/lib/dashboard-data.ts` |
| Claude Code | 완료 | 무인제어 화면의 타석 장비 OFF 버튼을 ON/OFF 토글로 전환(bay_on 액션 추가, 현재 상태 표시, 이용 중 타석 오조작 방지) | `src/app/api/admin/automation/route.ts`, `src/app/admin/automation/automation-client.tsx`, `src/lib/supabase/automation-status.ts` |
| Codex | 완료 | 자동 종료 로그 누락과 대시보드 오늘 예약 2건 집계 원인 점검 | Agent 종료 경로의 장비 반납 명령 누락 수정, 오늘 합계를 예약·입장으로 명확화 |

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

## Current Work (2026-08-16, Codex - Agent expiry release log)

- Status: implementation and local verification completed; owner approved a scoped commit and deployment.
- Production read-only finding: today's dashboard count of two consists of one `member_app` reservation and one completed administrator walk-in. The existing metric intentionally counts all non-cancelled reservations and entries whose start time is today, including completed rows.
- Production read-only finding: the administrator walk-in session completed normally, but no `release_bay` or `shutdown_pc` command was created at its expiry. The PC being off therefore was not caused by a recorded VISTA shutdown command.
- Root cause: `POST /api/agent/session/end` called the shared session closeout with `runAutomation: false`, so it completed the session and released the bay in the database while suppressing the local-controller equipment release command.
- Resolution: the Agent expiry endpoint now uses the same idempotent `closeSingleSession` automation path as admin/cron closeout, allowing a `release_bay` command and visible `타석 이용 종료` log to be created. Normal session expiry does not enqueue `shutdown_pc`; graceful PC shutdown remains a guarded `매장 종료` action.
- UI: dashboard KPI and mini status labels now say `오늘 예약·입장`, matching the existing calculation and its app versus walk-in/phone breakdown.
- Files: `src/app/api/agent/session/end/route.ts`, `src/app/admin/dashboard/dashboard-client.tsx`, `docs/SHARED-HANDOFF.md`.
- Verification: `npm run typecheck` and targeted ESLint passed. Full `npm run lint` remains blocked by the existing inaccessible `.tmp_pysdcp` folder. No production database write or physical device command was performed; the owner approved the scoped GitHub/Vercel release.
