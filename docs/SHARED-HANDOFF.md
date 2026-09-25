# VISTA Park Golf Connect 공용 작업 원장

최종 갱신: 2026-09-23
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
| Codex | 완료·읽기 전용 현장 진단·2026-09-24 | 송도 HA `.91` 운영체제/Observer 응답과 Core 웹 포트 장애 구분 | 본 원장 |
| Codex | 완료·배포 확인·2026-09-24 | 대시보드 비이용 타석 카드의 다음 예약/예약자·메모 칸 제거분만 분리 배포 | `src/app/admin/dashboard/dashboard-client.tsx`, 본 원장 |
| Codex | 완료·배포 확인·2026-09-24 | 승인된 관리자 대시보드·무인제어 UI 변경을 다른 미커밋 서버 작업과 분리해 배포 | `src/app/admin/dashboard/dashboard-client.tsx`, `src/app/admin/automation/automation-client.tsx`, 본 원장 |
| Codex | 완료·로컬 미리보기만·2026-09-24 | 무인제어 타석 연결 카드의 중복 상태 문구와 전원 스위치 오해 해소 | `src/app/admin/automation/automation-client.tsx`, 본 원장 |
| Codex | 완료·로컬 미리보기만·2026-09-24 | 무인제어 운영 상태 요약 4개 카드를 모바일에서 2열로 정리 | `src/app/admin/automation/automation-client.tsx`, 본 원장 |
| Codex | 완료·로컬 미리보기만·2026-09-24 | 매장 관리자 실시간 타석 카드에서 골프 A-01~A-07의 확인 불가 게임 행 및 표시 불필요한 고객·메모 칸 숨김 | `src/app/admin/dashboard/dashboard-client.tsx`, 본 원장 |
| Codex | 완료·로컬 미리보기만·2026-09-24 | 아파트 매장 관리자 대시보드 조명 버튼 숨김, 전체 준비/매장 종료 모바일 한 줄 정리 | `src/app/admin/dashboard/dashboard-client.tsx`, 본 원장 |
| Codex | 완료·로컬 미리보기만·2026-09-24 | 관리자 모바일 KPI 글자 쪼개짐 수정 및 사용자 요청의 입장 대기 카드 제거 | `src/app/admin/dashboard/dashboard-client.tsx`, 본 원장 |
| Codex | 완료·2026-09-23 | 송도 Agent 현장 진행 상태를 Claude 인수인계 문서로 정리 | `docs/claude-handoff-songdo-agent-field-20260923.md`, 본 원장 |
| Codex | 완료·현장 PC 식별 확인 대기·2026-09-23 | 송도 골프 1번 Agent 현장 설치 후 heartbeat·PC 식별 검증 | 운영 `agent_devices`·`bay_pc_registry` 읽기 전용, 관리자 화면, 본 원장 |
| Codex | 완료·2026-09-23 | 송도 P-01 관리자 정상 종료→HA WOL→Agent 자동 연결 현장 시험 | 운영 관리자 화면·송도 HA·읽기 전용 DB 확인, 본 원장 |
| Codex | 완료·현장 확대 대기·2026-09-23 | 송도 Agent 기존 토큰 9개 운영 DB 등록 및 P-01 heartbeat·대시보드 `PC 켜짐` 확인 | 운영 Supabase `agent_devices`, 본 원장 |
| Codex | 완료·현장 재시험 대기·2026-09-23 | 송도 현장 BAT의 `'p'` 명령 오류 대응: ASCII 호출명·CRLF·설치 ZIP 재검증 | `windows-agent/songdo/Agent설치.bat`, `windows-agent/songdo/install-agent.ps1`, `windows-agent/songdo/README.md`, 새 설치 ZIP, 본 원장 |
| Codex | 완료·현장 재시험 대기·2026-09-23 | 송도 Agent 설치 BAT 무반응 진단, 오류 표시를 위한 설치 패키지 수정 | `windows-agent/songdo/Agent설치.bat`, `windows-agent/songdo/README.md`, `windows-agent/dist/VISTA-Songdo-Agent-0.9.5-install-v2.zip`, 본 원장 |
| Codex | 완료·현장 설치 대기·2026-09-23 | 송도 HA 파크 1번 WOL 현장 확인, 최신 monitorOnly Agent 검증·재빌드 및 토큰 없는 송도 설치 ZIP 생성 | `windows-agent/bays.config.json`, `windows-agent/agent-config.test.js`, `windows-agent/songdo/`, `windows-agent/dist/VISTA-Songdo-Agent-0.9.5-install.zip`, 본 원장 |
| Claude Code | 완료·현장 설치 대기 | 송도파크자이 경량 Agent를 `monitorOnly` 설정으로 구현(별도 EXE 없음), 타석 9개 등록 SQL·설치 안내 | `windows-agent/electron-main.js`, `windows-agent/bays.config.json`, `windows-agent/README.md`, `supabase/agent-devices-songdo-template.sql` |
| Claude Code | 완료·현장 동작 중 | 송도 HA 구축: 9타석 WOL·ping·nmap 등록, `타석 전원` 대시보드, 05:50 자동 기상 automation | 송도 HA 인스턴스(저장소 외부), `H:\HA세팅\` USB 산출물 |
| Claude Code | 완료·배포됨 | PC 세팅 도구 등록 API의 하드코딩 공유 토큰 제거 → 등록 창구(enrollment window) 방식, 역할 테이블, WOL·MAC 수집 | `src/lib/pc-registry.ts`, `src/lib/pc-enrollment.ts`, `src/lib/pc-registry-payload.ts`, `src/app/api/pc-setup/*`, `src/app/admin/remote-access/*`, migration 4종 |
| Claude Code | 확인 결과 보고 | 위 Codex 두 행에 대한 2026-09-23 대조 결과. Codex 행은 그대로 두었다. ① `docs/claude-songdo-unified-agent-implementation.md`는 저장소에 없고 git 이력에도 없다(작성 전 중단으로 보임). 그 설계서가 담았을 내용은 위 `monitorOnly` 구현이 대체한다. ② `docs/claude-review-bay-standby-control.md`는 읽었고 검토 결과는 아래 2026-09-23 항목에 적었다. 다만 이 파일은 아직 untracked 라 push 되지 않았다 | 본 원장 |
| Codex | 완료·설계서만·2026-09-23 | Claude 검토 반영: 기존 monitorOnly 보완, 세션 없는 송도 1단계, 단일 EXE, 제어기·스케줄 전환 계획. 파일 생성 완료, 미커밋 | `docs/claude-songdo-unified-agent-implementation.md`, 본 원장 |
| Codex | 완료·검토 대기 | PC 전원·타석 장비·게임 대기모드 UI 재설계에 대한 Claude 독립 검토 요청서 작성 | `docs/claude-review-bay-standby-control.md`, 본 원장 |
| Codex | 완료·배포 대기 | 무인제어 매장 자동 시작·종료 시간의 시흥점 고정 기본값 제거 및 24시간 범위 자유 설정 명확화 | `src/app/admin/automation/automation-client.tsx`, 본 원장 |
| Codex | 완료·배포 대기 | 대시보드 무인 장비 마지막 명령에서 실행 이력 없는 하드코딩 행 제거 및 빈 표 숨김 | `src/lib/supabase/automation-status.ts`, `src/app/admin/dashboard/dashboard-client.tsx`, 본 원장 |
| Codex | 완료·배포 대기 | 관리자 대시보드 하단 본사 매장 현황·무인 운영 MVP 범위 제거 및 불필요 조회 정리 | `src/app/admin/dashboard/page.tsx`, `src/app/admin/dashboard/dashboard-client.tsx`, `src/lib/dashboard-data.ts`, 본 원장 |
| Codex | 완료·배포 대기 | 관리자 대시보드 상단 소개 배너 제거 | `src/app/admin/dashboard/dashboard-client.tsx`, 본 원장 |
| Codex | 완료·DB 적용/배포 대기 | 관리자 메뉴 단순화, 매장 관리자 전용 메뉴 제한, 무인제어 매장 시작·종료 시간 예약 기능 구현 | `src/lib/admin-context.ts`, `src/lib/dashboard-data.ts`, 관리자 셸·대시보드·무인제어 UI/API, 매장 제어기 스케줄 처리, `202609210001_store_automation_schedule.sql`, 본 원장 |
| Codex | 중지·미커밋 보존 | 기존 Agent를 중단·백업하고 설정을 보존한 채 0.8.0 포터블 Agent를 설치하는 현장용 전체 패키지 제작 | `windows-agent/install-agent.ps1`, 설치 안내·패키지 산출물, 본 원장 |
| Codex | 완료·현장 설치 대기 | Agent 0.8.0 통합 변경, 신규 DB migration, GitHub push 및 Vercel 운영 배포·검증 완료. A-02 Agent 교체와 HUD ROI 보정만 현장 작업으로 남음 | Agent 0.8.0 소스·테스트, heartbeat/telemetry/event 저장, 관리자 대시보드, 신규 migration, 본 원장 |
| Codex | 완료·운영 미적용 | A-02 현장 감지 기능을 Agent 0.8.0·서버 telemetry/event 저장·관리자 대시보드에 통합하고 로컬 검증 | `windows-agent/` 감지·outbox·패키징, `src/lib/game-telemetry.ts`, Agent heartbeat/저장 계층, 대시보드 데이터·화면, 신규 migration, 본 원장 |
| Codex | 완료·계획서만 | A-02 현장 전달본 분석 및 Agent 최종 배포본·관리자 대시보드 통합 구현 위임 계획서 작성 | `docs/agent-dashboard-field-integration-plan-20260917.md`, 본 원장; 구현·빌드·배포 없음 |
| Codex | 완료·배포 대기 | 미커밋 무인제어 상태 표시·타석별 ON/OFF·Agent 정상 종료 기능 마무리 및 기능 단위 커밋 | `src/lib/store-controller.ts`, `src/lib/supabase/automation-status.ts`, `src/app/admin/automation/automation-client.tsx`, `src/app/api/admin/automation/route.ts`, 본 원장 |
| Codex | 완료·배포 대기 | 회원 예약 화면 1차 정리: 관리자·비작동 링크 제거, 비로그인 예약 현황 숨김, 예약 입력 순서 재배치 | `src/app/member/app/page.tsx`, 본 원장 |
| Codex | 완료·배포 대기 | 매장 제어기 폴링 시 만료 세션 자동 종료·타석 반납·장비 OFF 명령 연결 | `src/lib/session-cleanup.ts`, `src/app/api/store-controller/commands/route.ts`, 본 원장 |
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
10. **무인제어의 매장 시작·종료 시간은 송도에서 실행되지 않는다.** `processStoreAutomationSchedule`의 호출 지점은 `src/app/api/store-controller/commands/route.ts:100` 하나뿐이고, 송도에는 매장 제어기가 없다. 저장은 되지만 그 시각에 아무 일도 일어나지 않는다. 같은 이유로 `/api/cron/close-expired-sessions`도 송도에서 돌지 않는다(`vercel.json`은 여전히 `{}`). 2026-09-23 확인.
11. **송도 1단계 계획 기준(2026-09-23 갱신): 고객 이용 세션을 요구하지 않는 관찰 전용 운영.** 사용자의 무메시지·상태 보고·관리자 PC 종료 요구를 기준으로 `monitorOnly`를 보완한다. 과거 아파트 전체화면 대기 시나리오는 이번 범위에서 채택하지 않는다. 시설의 예약제/선착순 정책 자체는 별도다. 상세는 `docs/claude-songdo-unified-agent-implementation.md`를 따른다.
12. 송도 타석 PC 한 대의 Windows 이름이 `RANGE2`인데 실제로는 파크골프 타석이다. Agent가 heartbeat로 `pc_name`을 채우므로 대시보드에 그대로 표시된다. Agent 설치 전에 이름을 바꾸는 편이 낫다.

## 작업 이력

| 날짜 | 작업자 | 변경·검증 | 상태 |
| --- | --- | --- | --- |
| Codex | 진행 중 | HH 골프 PC 세팅 도구 즉시 자동등록: 토큰 입력 제거, 제한된 자동등록 인증과 현장 보호 유지 | `src/app/api/pc-setup/catalog/route.ts`, `src/app/api/pc-setup/register/route.ts`, `src/lib/pc-registry.ts`, PC 세팅 도구, 본 원장 |
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

## Expired Session Polling Closeout (2026-09-15, Codex)

- `vercel.json` cron 대신 상시 실행 중인 매장 제어기의 `/api/store-controller/commands` 조회를 종료 스케줄러로 사용한다.
- 인증된 제어기 조회마다 시흥점의 종료시각이 지난 활성 세션만 확인하고, 기존 `closeExpiredSessions`를 통해 세션 완료·타석 반납·장비 OFF 명령 등록을 수행한다.
- 만료 정리를 예약 사전 준비보다 먼저 실행해 같은 조회에서 OFF와 ON이 함께 생기면 최종 명령 순서가 ON이 되도록 했다.
- 정리 실패는 기존 명령 수령과 예약 준비를 막지 않으며, 동시 조회는 기존 조건부 상태 갱신으로 중복 종료를 방지한다.
- 운영 DB·스키마 변경과 배포는 하지 않았다.
- 검증: typecheck, 대상 ESLint, `git diff --check`, 프로덕션 빌드 통과. `npm run preflight`는 샌드박스의 내부 `git` 실행 제한(`spawnSync git EPERM`)으로 실패하여 원장 확인과 `git status`를 수동 수행했다.

## Member UI Phase 1 (2026-09-15, Codex)

- `docs/codex-spec-member-ui-phase1.md`의 삭제·이동 범위만 반영했다. 예약 데이터 조회, 검증, 제출, 하단 고정 CTA 로직은 바꾸지 않았다.
- 첫 화면은 `예약 매장 → 날짜와 시간 → 이용시간 → 예약자 정보 → 예약 확인` 순서로 정리했다.
- 비로그인 예약 현황, 고객 화면의 관리자 링크, 눌리지 않는 하단 아이콘 4개를 제거했다. 로그인 상태의 `내 예약`은 유지했다.
- 앱 설치와 카카오 로그인 블록은 예약 안내 아래로 이동했다.
- 검증: typecheck, 대상 ESLint, `git diff --check`, 프로덕션 빌드 통과. 로컬 비로그인 화면에서 섹션 순서와 제거 항목을 시각 확인했다.
- 운영 DB에 예약을 생성하는 실제 접수 검증과 배포는 수행하지 않았다.

## Admin Automation Completion (2026-09-15, Codex)

- 남아 있던 무인제어 변경 4개 파일을 하나의 페이지+API 기능 단위로 마무리했다.
- PC 전원 표시는 Agent 최근 2분 신호를 기준으로 하고, 프로젝터·타석 장비는 실제 상태로 오인하지 않도록 마지막 ON/OFF 명령과 실행 시각을 별도로 표시한다.
- 타석별 PC 스위치가 켜진 상태에서는 Agent를 통한 Windows 정상 종료 명령을 보내며, 이용 중이면 서버와 화면에서 재확인을 요구한다. 꺼진 상태에서는 기존 타석 준비 명령으로 장비와 PC를 켠다.
- 관리자 `이용 종료 정리`도 현재 시흥점 세션만 처리하도록 매장 필터를 적용했다.
- 운영 상태 요약과 15초 자동 새로고침, 제어기 지연·이용 중 Agent 단절·실패 명령 경고를 추가했다.
- 검증: typecheck, 대상 ESLint, `git diff --check`, 프로덕션 빌드 통과. 로컬 관리자 로그인 세션이 없어 실제 페이지 렌더와 장비 명령 실행은 하지 않았다.
- 운영 DB·스키마 변경, 장비 제어, 배포는 수행하지 않았다.

## A-02 Field Agent Integration Plan (2026-09-17, Codex)

- 사용자 제공 `C:\VISTA\agent전달문서최종`은 실제 A-02 타석 PC의 Codex 작업 결과다. 최신 현장 전달/검증/빌드 문서, 이전 진단서, 홀 감지 설계와 전달된 소스를 읽고 현재 저장소의 heartbeat·검증기·대시보드와 대조했다.
- 결과물: `docs/agent-dashboard-field-integration-plan-20260917.md`. 하위 모델용 단계 A~G, 파일별 수정 범위, v1/v2 계약, 로컬 OCR 격리, 이벤트 outbox/멱등 저장, 대시보드 표시·권한, 설치 패키지/검증/롤백 및 시작 프롬프트를 작성했다.
- 현장 문서의 실증 범위는 OCR 1→2홀, 같은 라운드의 로비 복귀 1건이다. 3~18홀 전체/서버 저장/운영 대시보드 E2E를 검증 완료로 간주하지 않는다. 로비 복귀 횟수는 18홀 완주·예약·매출 건수가 아니다.
- 현장본과 저장소가 모두 0.7.0이지만 코드 계보가 다르다. 저장소 Claude 수정은 유지하고 현장 감지 기능만 선별 병합하도록 명시했다. 통합판 버전은 0.8.0 제안이며 아직 새 바이너리를 만들지 않았다.
- 신규 계약을 현재 서버가 그대로 저장하지 못하는 점, 현장 outbox ACK 부재, OCR가 시간 제어를 대기시킬 수 있는 점, 현장 패키지 비밀설정 포함을 통합 전 처리 사항으로 기록했다. 실제 비밀값은 열람·복사·기록하지 않았다.
- 사전 절차: preflight 최초 실행은 샌드박스 `spawnSync git EPERM`으로 실패했으나 승인된 실행으로 재시도해 통과했다. 원장 전체와 git status 확인 후 현재 작업을 등록했다. 타 작업자의 문서·Agent README 변경은 보존했다.
- 문서 검증: 신규 계획서와 원장 diff 공백 검사 통과, JSON 예시 3개 파싱 통과, 기존 소스 참조 12개 존재 확인. 문서만 변경했으므로 앱 빌드/전체 테스트는 재실행하지 않았다.
- 변경 범위는 계획서 신규 작성과 본 원장뿐이다. 구현/실행파일 실행/Agent 테스트 재실행/실기기 OCR 재검증/운영 DB 조회·변경/장비 제어/커밋/push/배포는 수행하지 않았다.
- 다음 작업: 사용자의 구현 요청 시 계획서 A 단계부터 착수. 관리자 권한 기준과 A-02 실제 HUD ROI는 활성화 전 확인 필요. 운영 migration·배포·실기기 제어는 별도 승인 필요.

## Agent 0.8.0 + Dashboard Field Integration (2026-09-17, Codex)

- `docs/agent-dashboard-field-integration-plan-20260917.md`의 안전 경계를 유지하면서 현장 A-02 감지 코드를 기존 0.7.0 계보에 선별 통합했다. 예약, 이용시간, 장비 자동화의 성공 여부는 OCR이나 게임 감지에 의존하지 않는다.
- Agent telemetry v2는 프로그램 실행, 메뉴, 일반 라운드, 연습장, 종료 중, 결과/중단 상태를 구분하고 `gameMode`, `courseId`, `roundId`, `gameInstanceId`, `contextEpoch`, 홀 출처·관측시각·layout 버전을 전송한다. 서버는 v1도 계속 허용한다.
- 홀 감지는 정확한 게임 창과 사전 보정된 ROI가 있을 때만 작동한다. 6초 안의 최근 3프레임 중 2회 일치해야 확정하고, 5초가 지나면 현재 홀을 숨긴다. 전체 바탕화면 캡처를 서버에 보내지 않으며 임시 ROI 이미지는 매 관측 뒤 삭제한다. 기본값은 비활성화다.
- `returned_to_lobby`는 로컬 디스크 outbox에 원자적으로 보관하고 서버 ACK를 받은 이벤트만 삭제한다. 이벤트는 Agent·라운드·유형 조합과 UUID로 멱등 저장한다. 로비 복귀는 18홀 완주, 예약 완료, 결제 완료를 뜻하지 않으며 대시보드에도 같은 안내를 표시한다.
- 신규 migration `supabase/migrations/202609170001_agent_round_events.sql`은 `agent_round_events`와 최신 샘플만 저장하는 원자적 RPC를 추가한다. migration이 아직 없는 서버에서는 기존 telemetry 저장으로 제한적으로 폴백하고 이벤트 저장 실패가 heartbeat를 중단하지 않는다. 기준 `supabase/schema.sql`도 같은 구조로 맞췄다.
- Agent heartbeat는 본문 크기 제한, 인증 Agent의 매장·타석과 access session 일치 검증, 이벤트 ACK/거절 응답을 추가했다. 대시보드는 Agent 버전, 감지 출처·신선도, 확인된 현재 홀, 연습장/중단/메뉴 상태, 오늘 로비 복귀 수와 최근 이벤트를 타석 상세에 표시한다. migration 미적용은 0건으로 오인하지 않고 미지원 상태로 처리한다.
- 실제 비밀 설정은 `%APPDATA%`의 `bays.config.local.json`만 우선 사용한다. 포터블 배포 폴더의 실제 local config는 개발 실행 외에는 읽지 않으며 패키지에는 placeholder 예제만 들어간다. 오프라인 진단판은 별도 `test-profile`을 사용해 운영 outbox·서버·시간제어와 격리된다.
- 배포 산출물: `windows-agent/release/VISTA-Bay-Agent-0.8.0-windows-x64.zip`과 `windows-agent/release/VISTA-Bay-Agent-0.8.0-offline-test.zip`. 두 ZIP 모두 실제 `bays.config.local.json` 항목 0개를 확인했다. SHA-256은 각각 `04F9F2124E4378CC7AB85BFBCC7A5A1958833B8E99A73932E9502D766C8B56F0`, `29C429471361D1347958CD579F36184E4E7E45DCB2EFB29CF323FF0A8E0F222F`다.
- 검증: Agent 정적 검사와 15개 테스트 통과, 웹 typecheck·전체 lint·프로덕션 build·`verify:quick`(정적 4, HTTP 15)·`git diff --check` 통과. Electron 31.7.7 unpacked 빌드와 ZIP 생성, asar 파일 목록 및 ZIP 비밀 설정 부재 검사를 완료했다. 인증된 관리자 페이지의 실제 브라우저 시각 검증과 A-02 실기기 OCR 3~18홀 검증은 하지 않았다.
- 2026-09-18 운영 반영: 사용자의 승인 아래 `202609170001_agent_round_events.sql`을 Supabase 운영 프로젝트에 적용했고, 기능을 `dbdbdb9`, Agent 배포물을 `15f4bb0`, 구버전 라운드 표시 호환 수정을 `a7a9361`로 나눠 `origin/main`에 push했다. Vercel에서 `a7a9361` 프로덕션 배포가 Ready임을 확인했다.
- 최종 포터블 실행파일은 `windows-agent/dist/VISTA-Bay-Agent.exe`와 `windows-agent/release/VISTA-Bay-Agent-0.8.0.exe`이며 파일 버전은 0.8.0, SHA-256은 `F805C76B46F3E453220E9F0DA1D9359572DA0BC3B1D5D0756E42DAE687BBC3A3`이다. 기존 0.7.0은 `windows-agent/release/VISTA-Bay-Agent-0.7.0-backup.exe`로 보존했다.
- 프로덕션 대시보드 실측: A-02는 최근 heartbeat로 `PC 켜짐`, `라운드 진행 · 홀 확인 불가`를 표시한다. 상세에는 실제 실행 중인 현장 Agent가 아직 0.6.0이고 출처가 `mixed`임이 보인다. 신규 이벤트 테이블 조회는 정상이며 오늘 로비 복귀는 0회다.
- 남은 현장 작업: A-02의 실행파일을 0.8.0으로 교체하고 시작프로그램을 재등록한 뒤, 오프라인 진단 프로필로 HUD ROI를 보정한다. 이후 1→2홀, 로비 복귀, 중단, Agent 재시작 후 outbox 재전송을 실증해야 한다. 장비 제어는 이번 배포 검증에서 수행하지 않았다.

## Store Manager Menu + Operating Schedule (2026-09-21, Codex)

- Claude 독립 검토용 `docs/claude-review-bay-standby-control.md`를 작성했다. 현재 PC ON과 장비 ON의 `bay_on` 중복, Agent의 세션 없음=`hidden` 동작, 종료 후 잠금·자동 종료, 물리 장비와 이용 권한의 차이, 아파트형 상시 대기와 시흥점형 세션별 절전 정책을 정리하고 최종 UI·상태 모델·API·예외·MVP에 대한 질문을 담았다. 문서 작성만 했으며 구현·DB·배포는 수행하지 않았다.
- 무인제어 운영시간의 미설정 기본값을 시흥점 기준 `08:00/21:00`에서 송도 운영 기준 `06:00/23:00`으로 변경했다. 입력은 `00:00~23:59` 전체 범위를 분 단위로 선택할 수 있고, 저장 API의 매장별 시간 분리와 동일 날짜 내 시작<종료 검증은 유지한다. 기존 저장값은 덮어쓰지 않는다. typecheck, 대상 ESLint, diff 공백 검사를 통과했고 커밋·배포는 수행하지 않았다.
- `무인 장비 마지막 명령`은 실제 완료된 ON/OFF 실행 이력이 있는 장비만 표시하도록 변경했다. 실행 이력이 없는 시흥점 기본 매핑 행은 다른 매장 대시보드에 노출하지 않으며, 유효한 기록이 0건이면 카드 전체를 숨기고 예약·입장 영역이 전체 폭을 사용한다. 운영 DB 기록은 삭제하지 않았다. typecheck, 대상 ESLint, diff 공백 검사를 통과했고 커밋·배포는 수행하지 않았다.
- 관리자 대시보드 맨 아래의 `본사 매장 현황`과 `무인 운영 1차 MVP 범위`를 완전히 제거했다. 함께 불필요해진 전체 매장 목록 조회, 컴포넌트 전달 타입, MVP 설명용 정적 데이터도 정리했다. typecheck, 대상 ESLint, diff 공백 검사를 통과했고 커밋·배포는 수행하지 않았다.
- 관리자 대시보드의 큰 제품 소개 배너와 출입문 2차 기능 안내를 제거해 주요 지표가 헤더 바로 아래에서 시작하도록 정리했다. 데이터 조회와 제어 동작은 변경하지 않았다. typecheck, 대상 ESLint, diff 공백 검사를 통과했고 커밋·배포는 수행하지 않았다.
- 관리자 대시보드의 주요 지표 5개를 모바일에서도 한 줄에 보이도록 5열 압축 레이아웃으로 변경했다. 작은 화면에서는 카드 여백·아이콘·숫자를 줄이고 설명문을 접어 세로 길이를 줄였으며, 데스크톱 설명문은 유지했다. typecheck, 대상 ESLint, 프로덕션 build, diff 공백 검사를 통과했고 커밋·배포는 수행하지 않았다.
- 대시보드의 작동하지 않던 모바일 햄버거 버튼을 제거하고, 대시보드·무인제어 양쪽에 공통 빠른 이동 버튼을 헤더 아래 항상 표시했다. 현재 화면은 활성 상태로 표시하며 실제 Next 링크로 이동한다. `npm run typecheck`, 대상 ESLint, 프로덕션 build, `git diff --check`를 통과했다. 커밋 `9766fe9`로 GitHub `main`에 push했으며 Vercel 자동 배포가 시작됐다.
- 대시보드 `매장 종료`를 PC Agent 종료와 로컬 제어기 장비 OFF로 분리했다. 제어기가 없어도 온라인 Agent가 있는 PC에는 정상 종료 명령을 보낼 수 있고, 제어기가 있으면 프로젝터·타석 장비·공용 조명·냉난방 OFF 명령도 함께 큐에 넣는다. 이용 중 세션은 계속 차단하며, Agent와 제어기가 모두 없으면 실행하지 않는다. typecheck, 대상 ESLint, 프로덕션 build, diff 공백 검사를 통과했다. 아직 커밋·배포하지 않았다.
- 운영 Supabase에 송도파크자이 전용 Auth 계정을 생성하고 `public.users.role=store_manager`, `store_users` 매장 배정을 확인했다. 이메일은 확인 완료 상태이며 실제 이메일과 비밀번호는 원장에 기록하지 않았다. 송도파크자이 매장은 코드 `VISTA-XII`, 타석 9개, 현재 `paused` 상태다.
- 전체 관리자 메뉴에서 아직 운영하지 않는 `경기기록`, `랭킹`, `대회운영`을 숨겼다. 페이지 소스와 데이터는 삭제하지 않았다.
- `public.users.role`과 `store_users` 배정을 우선 읽는 관리자 컨텍스트를 추가했다. `store_manager`와 `staff`는 배정된 매장의 `대시보드`, `무인제어`만 보며, 대시보드와 무인제어 API도 그 매장 ID로 조회·제어한다. 기존 본사 계정이나 구형 DB는 시흥점 기본값으로 호환된다.
- 무인제어 화면에 자동제어 사용 여부, 매장 시작 시간, 종료 시간 입력과 저장 버튼을 추가했다. 시작 시 공용 장비와 해당 매장에서 장비 매핑이 확인된 모든 타석에 ON 명령을 보내고, 종료 시 진행/초과 세션이 없을 때만 Agent PC 정상 종료와 타석·공용 장비 OFF를 실행한다.
- 매장 제어기 요청에 선택적 `x-store-id`를 추가하고 명령 조회·오래된 명령 정리 범위를 해당 매장으로 제한했다. 기존 시흥점 설정에 `storeId`가 없어도 기존 시흥점 ID를 사용한다. 신규 매장은 `controller.config.json`에 실제 매장 ID가 필요하다.
- 신규 migration: `supabase/migrations/202609210001_store_automation_schedule.sql`. 운영시간, 활성화 여부, 마지막 일일 실행 날짜를 `store_settings`에 저장한다. migration 미적용 화면은 저장을 막고 적용 필요 상태를 표시한다.
- 아파트 매장에서 실제 PC·프로젝터를 켜려면 아파트 `stores`/`store_users` 등록, 타석 코드별 `device-map` 또는 HA 스크립트 매핑, 해당 매장 제어기의 `storeId` 설정이 추가로 필요하다. 현재 저장소에는 아파트의 실제 매장 ID와 9개 타석 장비 매핑이 없다.
- 검증: `npm run typecheck`, `npm run lint`, 프로덕션 `npm run build`, 승인 실행의 `npm run verify:quick`(정적 검사 4종, HTTP 15종), `git diff --check` 통과. 로컬 관리자 로그인 화면 HTTP 200을 확인했다. 인증 계정별 실제 렌더, 운영 DB migration, 배포, 장비 제어는 수행하지 않았다.
- 변경은 아직 미커밋이다. 다른 작업자의 문서·PC 세팅 API 변경과 중지된 Agent 설치 패키지 파일은 보존했으며 수정하지 않았다.

## PC 세팅 도구 보안 수정 + 원격접속 (2026-09-19 ~ 09-22, Claude Code)

### 배포한 것

| commit | 내용 |
| --- | --- |
| `208d202` | 타석 PC 원격접속(AnyDesk) 등록 API 와 관리자 화면 |
| `4a52ce7` | HH 골프 PC 세팅 도구 지시서 |
| `7178ded` | `PC_SETUP_TOKEN` 환경변수 예시 |
| `eeaab91` | `docs/store-ledger.md` 매장 원장 |
| `3bfc132` | 원격접속 화면 수동 등록 |
| `3be06bf` | 대시보드 `장비 OFF` → `이용 종료` 로 명칭·문구 수정 |
| `69cd703` | Codex 의 매장 관리자 메뉴 제한·운영시간 자동 시작·종료 커밋 |
| `da18e36` | **등록 창구 방식**. 아래 보안 항목 참조 |
| `a261e86` | PC 등록에 WOL·MAC·네트워크 정보 수집 |

### 막은 보안 사고

Codex 의 미커밋 변경에 `AUTOMATIC_SETUP_TOKEN = "hh-golf-pc-auto-register-v1-20260920"` 가
소스에 그대로 들어 있었다. `ting1052-boop/vista-park-golf-connect` 는 **public 저장소**라
커밋했다면 누구나 타석 PC 를 등록할 수 있었다. 커밋 전에 제거했다.

대체 설계는 **등록 창구(enrollment window)** 다. 배포되는 PC 에 고정 비밀값을 넣지 않는다.
관리자가 원격접속 화면에서 창구를 열면 매장별로 기본 30분·10대 한도가 생기고, 그 안에서만
토큰 없는 등록이 통과한다. 창구 소진은 `created` 일 때만 차감하며
`.eq("pc_enrollment_remaining", remaining)` 조건부 갱신으로 동시 등록에도 음수가 되지 않는다.

`src/lib/pc-enrollment.ts`(신규), `src/lib/pc-registry.ts`, `src/app/api/pc-setup/register`,
`/api/pc-setup/catalog`. migration: `202609190001_bay_pc_registry`,
`202609210002_admin_roles`, `202609210003_pc_enrollment_window`, `202609220001_pc_wol_fields`.
전부 사용자가 적용 완료했다.

`PC_SETUP_TOKEN` 은 사용자가 대화창에 실제 값을 붙여넣은 적이 있어 로테이션을 안내했고,
새 값으로 `200` 을 확인했다. 원장에는 값을 적지 않는다.

### 대시보드 `장비 OFF` 명칭 수정

이 버튼은 PC 를 끄지 않는다. 세션 종료·타석 반납·장비 OFF 명령까지만 한다. 이름이
`장비 OFF` 여서 전원을 내리는 줄 알게 되어 있었다. `이용 종료` 로 바꾸고, 확인창에 실제로
하는 일 네 가지를 모두 적었다(`타석 PC 는 켜둡니다` 포함). 성공 표시도 `요청함` 으로 바꿨다.
PC 종료는 무인제어 탭의 타석 토글(`shutdown_pc`)이 한다.

## 송도파크자이 현장 구축 (2026-09-22 ~ 09-23, Claude Code)

### 현장에서 한 것 — Home Assistant

송도 HA(`192.168.0.91`)에 타석 9대를 붙였다. HA UI 좌표 클릭이 버튼을 자주 빗맞히고 이름이
엉뚱하게 배정되어(`button.golpeu6beon_pc` 가 실제로는 골프4번), 중간에 **HA 의 config-flow REST
와 WebSocket API 를 브라우저에서 직접 호출하는 방식**으로 바꿨다. MAC→타석 대응은 config entry
제목에서 다시 뽑아 전부 이름을 고쳤다.

- Wake-on-LAN 버튼 9개 (온보드 NIC MAC, broadcast `192.168.0.255`)
- Ping 센서 9개, nmap ARP tracker 9개
- 사이드바 대시보드 `타석 전원`(`/bays-dashboard/bays`) — 타석별 전원 + 켜기
- automation `매장 오픈 - 타석 PC 켜기 (05:50)` — 버튼 9개 동시 누름, 상태 `on` 확인

확정된 현장 값:

```
파크1번 .23 30:C5:99:AF:91:32    골프1번 .79 74:56:3C:23:84:D8
파크2번 .88 30:C5:99:AD:17:25    골프2번 .80 30:56:0F:AF:C0:91
                                 골프3번 .81 30:56:0F:A6:A9:98
                                 골프4번 .82 30:56:0F:AF:C0:90
                                 골프5번 .84 30:56:0F:A6:AB:15
                                 골프6번 .89 30:56:0F:A6:A9:75
                                 골프7번 .87 D8:5E:D3:A9:33:ED
```

### 현장에서 배운 것

- **BIOS 설정은 SSD 복제로 따라오지 않는다.** 메인보드 NVRAM 에 있다. ASUS PRIME B860M-A 기준
  `Advanced → APM Configuration` 에서 `ErP Ready` Disabled, `Power On By PCI-E` Enabled 를
  9대 모두 개별로 넣어야 한다. 이 점을 처음에 틀리게 말했고 현장에서 정정했다.
- **랜선은 보드 내장 2.5G 포트에 꽂혀 있어야 한다.** 확장 카드 포트는 꺼진 PC 를 깨우지 못한다.
  자동 NIC 선택을 `InterfaceMetric` 정렬로 했다가 IP 없는 확장 포트를 골랐다. 실제 IPv4 가 있는
  어댑터를 우선하도록 고쳤다.
- **ping 으로는 켜짐을 못 본다.** Windows 방화벽이 ICMP 를 막는다. ARP(`nmap -PR`)는 통과한다.
  HA 의 nmap tracker 로 해결했고, 개별 PC 방화벽은 건드리지 않아도 된다.
- **PowerShell 5.1 은 한글이 든 .ps1 을 UTF-8 BOM 없이는 파싱하지 못한다.** BOM 필수.

### USB 산출물 (`H:\HA세팅\`, 저장소 밖)

`wol-prep.ps1`(UTF-8 BOM, 자기 승격), `WOL준비.bat`, `HA에-PC붙이기.md`,
`송도파크자이-HA설치안내.md`, `ha-wol-파크.yaml`. 스크립트는 보드 확인 → BIOS 자동설정 시도 →
빠른 시작 끄기 → NIC WOL → 방화벽 ICMP 허용 → **23:10 마감 종료 예약**을 하고
`wol-<PC>.json` 과 `.log` 를 남긴다.

### 운영시간 06:00~23:00 을 나눠서 구현한 이유

사용자는 대시보드에서 시각을 저장하기로 했으나, 위 `확인된 남은 작업과 위험` 10번대로 송도에는
실행 주체가 없다. 그래서 둘로 나눴다.

| | 실행 주체 | 상태 |
| --- | --- | --- |
| 05:50 켜기 | HA automation | 현장 동작 중 |
| 23:10 끄기 | 각 PC 작업 스케줄러 (`shutdown /s /f /t 300`, 5분 예고) | `WOL준비.bat` 재실행 필요 |

끄기를 PC 가 스스로 하게 둔 것은 의도다. HA 가 죽거나 네트워크가 끊겨도 매장은 닫힌다.

### 경량 Agent — 별도 EXE 를 만들지 않았다

사용자 사양은 고객용 기능 1~3(남은시간 경고·잠금화면·자동 PC 종료)을 빼고 4~7(서버 세션 조회·
heartbeat·게임 상태·관리자 종료 명령)만 남기는 것이었다. 4~7 은 이미 UI 와 분리되어 있어
**타석 설정의 `"monitorOnly": true` 한 줄**로 끝났다. 별도 실행파일은 빌드·릴리스·설치 안내가
두 벌이 되고 고친 내용이 한쪽에만 들어간다.

`monitorOnly` 는 `autoShutdownAfterEndMinutes` 를 강제로 0 으로 만든다. 설정에 값을 깜빡
남겨둬도 손님 이용 중에 PC 가 꺼지지 않게 하기 위한 것이다. 시흥 설정은 변경하지 않았다.

- `windows-agent/electron-main.js` 3줄 + VERSION 0.9.5
- `windows-agent/bays.config.json` 송도 9타석(`SD-R-01`~`SD-R-07`, `SD-P-01`, `SD-P-02`).
  `bayCode` 는 서버가 쓰지 않는 로컬 키다(heartbeat 는 토큰으로만 매장·타석을 판별한다).
  시흥 `A-01`~`A-03` 과 충돌하지 않게 접두사를 붙였다. `pcName` 은 적지 않아 호스트명을 따른다.
- `supabase/agent-devices-songdo-template.sql`(신규) — UUID 를 붙여넣지 않고 매장 코드·타석
  코드로 찾아 넣는다. 1단계로 실제 `bay_code` 를 확인한 뒤 2단계를 실행한다.
- `windows-agent/README.md` — 아파트 매장 절차와 시흥 대비표

트레이 아이콘은 넣지 않았다. Agent 가 죽으면 아이콘도 사라져 장애 확인 수단이 못 되고,
대시보드 `PC 켜짐`(heartbeat)이 같은 일을 9대분 한 화면에서 한다.

### 검증

`node --check` 통과. 병합 설정 확인: 타석 12개, `bayCode` 중복 없음, 송도 9개 모두
`monitorOnly=true`·`autoShutdown=0`·`sessionSource=server`. 시흥 3개는 값 변동 없음.
실기기 설치와 실제 종료 명령은 수행하지 않았다.

### 원장 대조에서 나온 것

- `docs/claude-songdo-unified-agent-implementation.md` 는 존재하지 않는다. git 이력에도 없다.
- `docs/claude-review-bay-standby-control.md` 는 untracked 다. 커밋해야 다른 작업자가 본다.
- **Codex 의 미커밋 `store_close` 수정(제어기 없이도 Agent 종료)이 배포되지 않았다.**
  운영은 아직 제어기가 없으면 `매장 종료`가 409 로 거부한다. 타석별 `PC 정상 종료` 는
  운영에서도 동작한다. 송도에 필요한 코드이므로 검토 후 커밋 대상이다.
- `docs/store-ledger.md` 송도 항목이 낡았다. HA 는 설치 완료이고, 타석 코드는 `R-01`~`R-07` 이
  아니라 DB 확인이 필요하다. 아직 고치지 않았다.

### commit/push/deploy

`monitorOnly` 관련 변경(`electron-main.js`, `bays.config.json`, `README.md`,
`agent-devices-songdo-template.sql`)과 본 원장 갱신은 **미커밋**이다. 운영 DB 쓰기·배포·
기기 전원 제어는 수행하지 않았다. 다른 작업자의 미커밋 변경 4건
(`dashboard-client.tsx`, `automation/route.ts`, `store-controller.ts`, 본 원장의 Codex 항목)은
보존했다. 원장의 Codex 행 중 사실과 다른 것 하나는 지우지 않고 상태만 정정했다.

### 남은 현장 작업

1. 9대 모두 `WOL준비.bat` 재실행 (23:10 종료 예약이 아직 안 들어갔다)
2. 송도 `bay_code` 확인 → 토큰 9개 발급 → SQL 2단계 → `bays.config.local.json`
3. Agent 는 1대만 먼저 설치해 하루 관찰
4. HA 의 잔여 항목 `Wake on LAN 88:c9:b3:b2:d2:03` 삭제(엔티티 없음, 무해)
5. `RANGE2` 호스트명 변경

## 송도 공용 Agent 재계획 (2026-09-23, Codex)

- 누락됐던 `docs/claude-songdo-unified-agent-implementation.md`를 실제 생성했다. 위 Claude의 문서 부재 지적은 작성 전 시점의 유효한 기록이다. 현재는 파일이 있으며 미커밋이다.
- 기존 `monitorOnly`와 현장 HA 구축을 재사용한다. 별도 EXE/새 프로필 체계를 만들지 않고 사용자 지정 골프 A-01~A-07, 파크 P-01/P-02와 로컬 선택 키/실제 DB 식별자를 구분한다.
- 계획에 만료 세션의 `beginEndNotice`→`completeExpiredSession` 부작용 차단, 매장별 장비 매핑, 전역 제어기 enabled와 실제 송도 연결 상태 구분, 기존 HA/Windows 시간 예약의 중복 전환을 추가했다.
- 순서: Agent 보완 및 관리자 PC 종료 → P-01 실증 → P-02 → 송도 제어기/스케줄 전환 → 골프 타석 확대. 게임 실행을 실제 이용 인원으로 세지 않는다.
- 변경 파일: 신규 설계서와 본 원장뿐. 다른 작업자의 Agent·서버·패키지 변경 보존. 운영 코드 수정·빌드·DB·장비 조작·커밋·push·배포 없음.
- 검증: preflight는 샌드박스 EPERM 후 승인된 재실행 통과. 원장 전체, git status, 관련 소스/미커밋 diff를 읽고 문서와 대조했다. 문서 공백 검사 수행. 현장 구축·운영 상태는 Claude 보고를 전제로 하며 이번에 직접 실증하지 않았다.

## 송도 파크 1번 WOL 및 Agent 설치판 (2026-09-23, Codex)

- Chrome의 송도 HA `파크1번 (내장랜)` 기기에서 WOL `누르기`를 실행했다. 로그북에 15:58:45 실행 기록이 생겼고, `타석 전원` 화면은 파크1번 `재실`을 표시했다. 실제 모니터 화면 부팅과 Agent 설치·대시보드 연결은 아직 현장 확인이 필요하다.
- 기존 `windows-agent/songdo/VISTA-Bay-Agent.exe`가 monitorOnly 만료 세션 차단 수정 이전 빌드였으므로 최신 0.9.5 소스를 독립 출력 폴더에 재빌드했다. 최종 EXE를 송도 폴더에 반영했다.
- 송도 9타석이 시흥 `ScreenGolf.exe`·로그 경로를 상속하지 않도록 `gameMonitoringEnabled`와 `gameLogDiagnosticsEnabled`를 타석 설정에서 false로 명시했다. 실제 송도 게임 감지 근거가 확인될 때까지 대시보드는 확인 불가로 표시한다. 시흥 3타석 설정은 유지했다.
- 현장 README의 잘못된 `C:\VISTA` 실행 경로를 `%LOCALAPPDATA%\VISTA`로 바로잡고 토큰 생성 안내의 SQL USB 복사 문구를 수정했다.
- 배포물 `windows-agent/dist/VISTA-Songdo-Agent-0.9.5-install.zip`에는 EXE, 설치 BAT/PS1, README 4개만 있다. 실제 토큰 파일과 SQL은 포함되지 않는다. EXE SHA-256: `5EFA0F34C3108E6234A0A8564B07568140C5AEC7F813663C65F4BB17392716C4`. ZIP SHA-256: `AEFD2775E6964CB9E6953B8350600AE73C0E9E4EDC365196D4C9F56321DC6B18`.
- Agent check 전체 통과. 빌드된 asar에서 버전 0.9.5, 만료 세션 차단 코드, 송도 9타석 monitorOnly/게임 감지 off, 실제 local token 파일 미포함을 확인했다. 설치 스크립트 PowerShell 구문 오류 0·UTF-8 BOM 확인, 생성 토큰 9개/작성 SQL 토큰 자리표시자 0개(값 출력 없음), gitignore 적용 확인.
- 남은 단계: 송도 실제 bay_code를 읽고 토큰 등록 SQL의 매장 코드 대응을 확인·운영 적용(별도 승인), P-01 설치 계정에서 ZIP 압축 해제 후 `songdo-tokens.json` 한 파일만 같은 폴더에 추가해 `Agent설치.bat` 실행, 대시보드 heartbeat/관리자 종료/재부팅 자동실행 확인. DB 쓰기·실제 PC 종료·Git commit/push/Vercel 배포는 수행하지 않았다.

### 설치 BAT 무반응 후속 점검

- 사용자가 P-01에서 설치 BAT를 실행했으나 아무 반응이 없다고 보고했다. 운영 대시보드 P-01은 16:20 KST 기준 `Agent 신호 없음`이었다. 실제 P-01 Windows 화면/오류 문구는 아직 보지 못했으므로 원인은 미확정이다.
- 설치 BAT에 PowerShell 종료 코드와 `pause`를 추가해 초기 실패 때 검은 창이 닫히지 않게 했다. README에 ZIP 압축 해제, 설치 프롬프트와 Agent 무화면 실행의 차이, 주소창 `cmd` 진단 절차를 명시했다.
- 새 배포물 `windows-agent/dist/VISTA-Songdo-Agent-0.9.5-install-v2.zip`에는 EXE·BAT·PS1·README 4개만 있다. ZIP SHA-256: `72147D3635638DF8009F1042A4D0FC14E8F2246E5CE08D98E40ADB683C0D2B57`. EXE 자체는 직전 검증한 0.9.5와 동일하다.
- 현장 설치, 등록 SQL 실행, 타석 PC 종료는 수행하지 않았다. 다음 단계는 P-01에서 새 ZIP을 전부 압축 해제하고 토큰 파일을 같은 폴더에 놓은 뒤 BAT를 실행해 표시되는 오류/프롬프트를 확인하는 것이다.

### 송도 설치 BAT의 명령 해석 오류 후속 수정

- 현장 P-01에서 `'p'은 내부 또는 외부 명령이 아닙니다` 오류가 보고됐다. v2 BAT의 실제 바이트는 CRLF 0개, LF 단독 8개였으며 한글 PS1 파일명을 호출하고 있었다. 현장 오류와의 정확한 인과는 PC에서 아직 재검증하지 않았다.
- BAT를 ASCII 명령과 CRLF 7줄로 정규화하고, 동일한 PowerShell 스크립트를 ASCII 이름 `install-agent.ps1`로 복사해 호출한다. README의 패키지 파일명도 갱신했다.
- `windows-agent/dist/VISTA-Songdo-Agent-0.9.5-install-v3.zip`은 EXE·BAT·영문명 PS1·README 네 파일만 포함하며 토큰과 SQL은 없다. SHA-256: `8416FD74532310270117E71BF58CC9ACA5BAB539A7FB49AFB8EF218B24DB39DB`. EXE는 기존 0.9.5와 동일하다.
- 검증: BAT LF 단독 0, PS1 UTF-8 BOM 확인·PowerShell parse 오류 0, ZIP 항목 4개, diff 공백 검사 통과. 현장 실행·운영 DB 쓰기·배포·커밋은 하지 않았다. 다음은 v3 ZIP을 새 폴더에 완전히 압축 해제하고 비밀 토큰 JSON을 같은 폴더에 둔 뒤 P-01 설치 재시험이다.

### 송도 Agent 운영 등록 및 P-01 연결 복구

- 사용자가 송도 Agent 9개 운영 등록을 명시 승인했다. 등록 전 송도 매장 `VISTA-XII`의 실제 타석 코드 `A-01`~`A-07`, `P-01`~`P-02` 9개와 `agent_devices` 0건을 읽기 전용으로 확인했다.
- 로컬 설치 JSON·생성 SQL의 토큰 9개가 서로 일치하고, 현장 USB의 JSON이 같은 파일이며, 기존 DB에 같은 토큰 해시가 없음을 확인했다. 실제 토큰 값·해시는 원장에 기록하지 않는다.
- 승인 범위대로 송도 타석 9개에 `agent_devices` 신규 행 9개를 등록했다. 다른 매장 및 기존 Agent 행은 변경하지 않았다. 재조회 결과 9개 등록·활성 상태 확인.
- P-01에서 Agent `0.9.5`, PC 이름 `PARK01`의 `last_seen_at`이 새로 기록됐다. 운영 관리자 대시보드를 새로고침해 P-01 `PC 켜짐` 표시를 직접 확인했다. 앞선 401의 원인은 서버 측 Agent 등록 누락이었다.
- 나머지 8대는 아직 Agent 설치/heartbeat가 확인되지 않았다. P-01의 재부팅 자동실행·관리자 PC 정상 종료는 현장 시험 전이다. Git commit/push 및 Vercel 배포 없음.

### 송도 P-01 정상 종료·WOL·자동실행 현장 시험

- 사용자 시험 승인 후 송도 P-01의 `bays.status=available`, 진행 중 세션 0건, Agent 온라인을 확인했다. 무인제어의 P-01 `PC 정상 종료`만 실행했고 매장 전체/다른 타석은 조작하지 않았다.
- 관리자 화면은 종료 명령 전달 성공과 제어 로그를 표시했다. `store_controller_commands`의 P-01 `shutdown_pc`는 `succeeded`, 시도 1회, 오류 없음으로 확인됐다. Agent 마지막 heartbeat는 16:48:29 KST에서 멈췄다.
- 사용자가 현장 PC의 실제 종료를 확인했다. HA 로그북 `파크1번 ping`은 16:49:37 연결 해제 기록. 16:52:38 HA `파크1번 켜기` WOL 실행 기록, 16:53:26 ping 재연결 기록을 확인했다.
- 재기동 뒤 P-01 Agent 0.9.5의 새 heartbeat와 `PARK01` PC 이름이 기록됐고 무인제어 화면이 `PC 켜짐`으로 돌아왔다. 재부팅 후 자동연결은 확인됐으며 Windows 로그인 방식 자체는 관찰하지 않았다.
- 관찰사항: HA 대시보드의 nmap 기반 `재실` 표시는 PC가 물리적으로 꺼지고 ping이 끊긴 동안에도 유지됐다. 실제 전원 확인에는 현재 ping/Agent 신호가 더 유효하며 HA 카드의 상태 기준은 후속 점검 대상이다. 나머지 8대 설치·검증은 별도. 코드 변경·Git commit/push·Vercel 배포 없음.

### 송도 A-01 Agent 첫 연결

- 사용자가 골프 1번에 설치했다고 보고했다. 운영 `agent_devices`에서 A-01 Agent 0.9.5의 새 heartbeat와 `pc_name=Range2`를 확인했다. 관리자 무인제어는 `PC Agent 연결 2/9`, A-01·P-01 모두 `PC 켜짐`으로 표시한다.
- `bay_pc_registry`에는 A-01 컴퓨터명이 `RANGE01`, P-01 컴퓨터명이 `RANGE2`로 남아 있고, 과거 원장에는 `RANGE2`가 실제 파크 타석이라고 적혀 있다. 현재 Agent의 P-01 이름은 `PARK01`이므로 이 등록 정보는 오래됐을 가능성이 있다. A-01 Agent를 설치한 실제 물리 타석이 골프 1번인지 현장 확인 필요. 서버/설치 설정은 확인 전 변경하지 않는다.
- 운영 DB·기기 변경, 코드 수정, Git commit/push, Vercel 배포 없음. `preflight` 통과.

### 송도 현장 Agent Claude 인수인계

- `docs/claude-handoff-songdo-agent-field-20260923.md`를 작성했다. 송도 9타석 Agent 등록 완료, P-01 종료/WOL/자동연결 실증, A-01 `Range2` 이름 불일치와 물리 설치 위치 확인 필요, 나머지 설치 순서, 토큰 비밀 유지·재발급 금지를 한 문서로 전달한다.
- 문서 작성 외 코드·운영 DB·기기·배포 변경 없음. 커밋/push 없음. 다른 미커밋 변경 보존.

### 관리자 모바일 대시보드 KPI 정리

- 운영 사이트를 휴대폰 폭으로 확인했다. 이전 5개 KPI 카드가 한 줄에 배치되기는 했지만 긴 제목과 아이콘 때문에 글자가 세로로 쪼개지고 카드가 높아져 실제 사용성이 나빴다. 변경 누락이 아니라 반응형 표현 문제였다.
- `src/app/admin/dashboard/dashboard-client.tsx`에서 사용자 요청대로 `입장 대기` KPI 카드를 제거했다. 남은 4개는 모바일에서 짧은 제목(`이용 중`, `빈 타석`, `알림`, `오늘`)과 한 줄 숫자를 사용하고 아이콘/설명은 숨긴다. 데스크톱의 원래 긴 제목·아이콘·설명은 유지한다. 이용 중 상세 버튼의 접근성 이름도 유지했다. 키오스크 대기 데이터·동작은 변경하지 않았다.
- `npm run typecheck`, 대상 ESLint, diff 공백 검사를 통과했다. 로컬 Next dev 서버는 `http://localhost:3000`에서 실행 중이다. 인증되지 않은 로컬 브라우저는 `/admin/login`으로 이동하므로 로그인 후 시각 확인이 필요하다. dev 서버를 켠 채 production build는 실행하지 않았다.
- 사용자가 **운영 배포는 하지 말고 로컬 미리보기만** 보기로 명시했다. Git commit/push/Vercel 배포, 운영 DB·기기 조작 없음. 기존 동일 파일의 다른 작업자 `store_close` 문구 변경은 보존했다.

### 아파트 매장 관리자 대시보드 제어 버튼 정리

- `src/app/admin/dashboard/dashboard-client.tsx`: `store_manager`/`staff`의 제한 메뉴 계정에서는 대시보드 `매장 조명 ON/OFF` 버튼을 숨긴다. 본사 계정의 조명 버튼과 API 기능은 유지한다. `매장 전체 준비 ON`·`매장 종료`는 모바일에서 한 줄 2열로 배치하고, 준비 버튼의 설명문을 제거했다. 작은 화면에서는 긴 종료 설명과 아이콘을 숨겨 버튼 높이를 줄인다.
- 검증: `npm run typecheck`, 대상 ESLint 통과. 로컬 `http://localhost:3000/admin/dashboard`는 서버 응답 307로 로그인 화면에 이동하므로 로그인한 화면의 시각 확인은 사용자 몫이다.
- 사용자의 이전 지시대로 로컬 미리보기만 유지한다. commit/push/Vercel 배포, 운영 DB·기기 제어 없음. 동일 파일의 기존 미커밋 `store_close` 문구 변경과 다른 작업자의 파일은 보존했다.

### 매장 관리자 실시간 타석 카드 항목 정리

- `src/app/admin/dashboard/dashboard-client.tsx`: 제한 메뉴 매장 관리자 화면의 골프 A-01~A-07 카드에서 `게임 상태 확인 불가` 또는 `게임 감지 미지원` 행만 숨긴다. 실제 감지된 게임 상태는 유지한다. 같은 계정의 이용 중 카드에서는 이미지에서 X 표시된 `이용 고객`과 `메모`만 숨기고 종료 예정·시작 시간·이용 종료·시간 조정은 유지한다. 본사/시흥점과 이용 중이 아닌 카드의 정보는 변경하지 않는다.
- 검증: `npm run typecheck`, 대상 ESLint 통과. 로컬 미리보기 로그인 화면 뒤의 실제 계정별 시각 검증은 하지 못했다.
- commit/push/Vercel 배포, 운영 DB·기기 제어 없음. 기존 미커밋 변경 보존.

### 무인제어 모바일 상태 카드 2열

- `src/app/admin/automation/automation-client.tsx`: 상단 운영 상태 요약 4개 카드(매장 제어기, 장비 명령 대기, PC Agent 연결, 현재 이용 세션)를 모바일에서 1행 2개씩 표시한다. 모바일 카드 패딩·문자 크기를 줄이고 아이콘만 숨긴다. 태블릿은 2열, 넓은 데스크톱은 기존 4열을 유지한다.
- 검증: `npm run typecheck`, 대상 ESLint 통과. 로컬 로그인 화면 뒤의 계정별 실제 시각 검증은 하지 못했다.
- 사용자의 이전 지시대로 로컬 미리보기만 유지한다. commit/push/Vercel 배포, 운영 DB·기기 제어 없음. 기존 미커밋 변경 보존.

### 무인제어 타석 연결 카드 정보 정리

- `src/app/admin/automation/automation-client.tsx`: PC 최근 신호는 상단 배지·마지막 신호 시각으로 한 번만 보여준다. 오프라인 이용 경고와 PC 제어 영역의 중복 Agent 문구를 제거했다. 실제 전원이 확인되지 않은 상태를 OFF로 오인시키던 스위치는 `PC 켜기`/`PC 정상 종료` 명령 버튼으로 바꿨다. 매핑이 없는 타석은 비활성 장비 버튼과 중복된 명령 기록 대신 `타석 장비 제어 미연결` 한 줄만 표시한다. 장비가 연결된 타석의 명령 기록과 ON/OFF 버튼은 유지한다.
- 기존 API 호출, 확인 대화상자, 이용 중 강제 확인, 제어기/Agent 연결 검사 및 비활성 조건은 변경하지 않았다. 전원 실측을 새로 주장하지 않는다.
- 검증: `npm run typecheck`, 대상 ESLint 통과. 인증된 로컬 화면의 실제 시각 검증은 하지 못했다. 사용자의 이전 지시대로 로컬 미리보기만 유지하며 commit/push/Vercel 배포, 운영 DB·기기 제어 없음.

### 관리자 모바일 UI 운영 배포 (2026-09-24)

- 사용자의 `배포` 승인에 따라 위 관리자 대시보드·무인제어 UI 변경만 `f264a31`로 커밋하고 `origin/main`에 푸시했다. Vercel의 해당 커밋 상태가 `success` (`Deployment has completed`)임을 확인했다.
- 배포 파일: `src/app/admin/dashboard/dashboard-client.tsx`, `src/app/admin/automation/automation-client.tsx`. 대시보드 파일에 있던 다른 작업자의 미커밋 `store_close` 문구 변경 2곳은 인덱스에서만 제외해 작업트리에 보존했다. 미커밋 서버/Agent 변경과 본 원장의 다른 기록도 배포에 포함하지 않았다.
- 검증: `npm run preflight`, `npm run typecheck`, 대상 ESLint, `npm run build`, staged diff 공백 검사 통과. 빌드 후 로컬 미리보기 서버를 `http://localhost:3000`으로 재시작했다. 운영 DB 쓰기·현장 장비 제어 없음.

### 비이용 타석 카드의 보조 정보 제거 (2026-09-24)

- `src/app/admin/dashboard/dashboard-client.tsx`의 이용 중이 아닌 카드에서 `다음 예약`/`예약자`와 `메모` 두 칸을 제거했다. 상태 문구와 관리 버튼은 유지한다. 데이터/API는 변경하지 않았다.
- `npm run preflight`, `npm run typecheck`, 대상 ESLint 통과. 같은 파일의 다른 작업자 `store_close` 문구 변경 2곳은 보존했다. 이번 변경은 로컬 미리보기만이며 commit/push/Vercel 배포, 운영 DB·기기 조작 없음.

### 비이용 타석 카드 변경 운영 배포 (2026-09-24)

- 사용자의 배포 승인 후 위 UI 변경 4줄 삭제만 `ea5d200`으로 커밋하여 `origin/main`에 푸시했다. Vercel 커밋 상태 `success` (`Deployment has completed`) 확인. 같은 파일의 다른 작업자 `store_close` 문구 2곳과 기타 미커밋 서버/Agent 변경은 작업트리에 그대로 두고 배포에서 제외했다.
- `npm run preflight`, `npm run typecheck`, 대상 ESLint, `npm run build`, staged diff 공백 검사 통과. 운영 DB 쓰기·현장 장비 명령 없음.
- 별도 읽기 전용 연결 점검에서 이 컴퓨터의 `192.168.0.91:8123` TCP 연결이 실패했다. 현재 Wi-Fi가 송도 매장망과 동일한 물리 네트워크인지는 확인되지 않았으므로 HA 장애 판정은 보류한다.

### 송도 HA 현장 연결 진단 (2026-09-24)

- 사용자가 현재 송도 매장이라고 확인했다. 현장 PC `192.168.0.83/24`에서 HA `192.168.0.91`은 ICMP ping 응답(약 2ms), ARP 응답이 있었다.
- HA Observer `http://192.168.0.91:4357/`는 HTTP 200이며 `Supervisor: Connected`, `Support: Supported`, `Health: Healthy`를 표시했다. 반면 HA Core 웹 포트 `8123`은 TCP 연결 실패. 따라서 HA OS/VM이 완전히 꺼진 상태는 아니며 Core 서비스 또는 해당 포트의 문제 가능성이 높다. Core 프로세스·로그는 아직 확인하지 않았다.
- 읽기 전용 연결 확인만 했으며 Core 재시작, 호스트 재부팅, WOL 명령, 설정 변경은 하지 않았다. 다음 단계는 현장 HA 호스트/VM 콘솔에서 `ha core info`, `ha core logs`, 호스트 자원 사용량을 확인하고 백업 존재 여부를 점검하는 것이다.
