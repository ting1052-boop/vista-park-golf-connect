# codex 전달문 — 2026-07-12

이 문서 하나로 착수 가능. 상세 명세는 `docs/codex-spec-agent-overlay-and-manual-end.md` (확정본, 사용자 승인 완료).

---

## 0. 작업 규칙 (먼저 읽을 것 — 위반 전례 있음)

1. **프로덕션 Supabase에 쓰기 금지.** 테스트 데이터가 필요하면 사용자 승인을 먼저 받는다.
   - 전례: 07-08 18시경 대시보드 기능 개발 중 프로덕션에 워크인 세션 3건 생성 + 세션 시각 수동 수정 → 사용자가 "유령 이용중" 소동으로 원인 추적하는 데 반나절 소요됨.
   - 부득이 만들 경우: `guest_name`에 `[TEST]` 접두어 + 작업 종료 시 반드시 정리 + 사용자에게 보고.
2. **공개 저장소다.** 시크릿 절대 커밋 금지. 에이전트 토큰은 `windows-agent/bays.config.local.json`(gitignored)에만. `bays.config.json`은 placeholder 유지.
3. **빌드 규칙**:
   - Next 빌드: dev 서버 켠 채 `npm run build` 금지 (`.next` 캐시 깨짐 전례 2회).
   - Windows Agent 배포 빌드: `electron-builder`(npm run dist)는 winCodeSign 심링크 오류로 **실패**함. 대신:
     ```
     cd windows-agent
     rm -rf dist dist-packager   # dist 잔재가 있으면 asar가 270MB로 비대해짐 (전례)
     npx @electron/packager . "VISTA Bay Agent" --platform=win32 --arch=x64 --out=dist-packager --overwrite
     ```
   - 빌드 후 asar에 실토큰 포함 확인(로컬 config 번들), zip으로 묶어 전달.
4. 커밋은 기능 단위로 쪼개고, 이 저장소 기존 커밋 메시지 스타일(영문 명령형 한 줄)을 따른다.

---

## 1. 구현 작업 (명세: codex-spec-agent-overlay-and-manual-end.md)

### A-1. 관리자 수동 이용종료
- `src/lib/session-cleanup.ts`의 세션 1건 종료 로직을 `closeSingleSession()`으로 추출 (조건부 상태 업데이트 유지).
- `POST /api/admin/session/end` 신설 (관리자 인증): 세션 completed + kiosk_sessions 잠금 + 타석 available + `runBayAutomation(exit)`.
- 대시보드의 가짜 "전원 OFF/종료"(`handlePowerOff` — 현재 bays.status만 변경)를 이 API로 교체. confirm 다이얼로그 필수.

### A-2. 관리자 수동 입장 (반무인 운영 지원)
- `POST /api/admin/session/start` 신설: `{ bayId, durationMinutes(30/60/90/120), guestName? }`.
- **키오스크 워크인 로직 재사용** — `/api/kiosk/walk-in/start` 흐름을 공용 함수로 추출해 두 라우트가 공유. 중복 구현 금지.
- memo에 "관리자 접수" 표기, 후불 미결제 memo 동일 기록(→ /admin/unpaid).
- 대시보드의 가짜 "입장 처리"(`handleCheckIn` — 90분 하드코딩, 로컬 상태만)를 시간 선택 + 이 API로 교체.

### B. Agent 오버레이 재설계 (windows-agent/)
- 평소(남은시간 > 10분 또는 세션 없음): **오버레이 완전 숨김** (상시 미니 바 제거).
- 종료 10분 전: 우상단 **컴팩트 바** = `타석번호 / 남은시간(mm:ss)` + **[확인] [연장]**.
  - [확인] = 바만 숨김(그 세션 동안 재등장 없음). 3분 전 재알림 **제거**.
  - [연장] = 작은 다이얼로그: 기본 30분, [+]로 30분씩 누적(상한 없음), 요금 표시 없음 → 확정 시 `requestedMinutes`로 `POST /api/agent/extension-request` → **즉시 연장(auto)**. 처리 후 "○○분 연장되었습니다" 표시.
- 0분: 전체화면 잠금 유지.
- 연장분은 extension_requests에 기록되어 정산 확인 가능해야 함(관리자 승인 게이트 아님).
- 직전 커밋에서 창 50% 축소(zoomFactor 0.5, mini 300×86/warning 350×210)를 넣어뒀으나 이번 재설계로 mini/warning 레이아웃 자체가 대체됨 — 재설계 기준으로 정리할 것.
- 완료 후 §0-3 규칙대로 재빌드 + zip.

### 수용 기준 (명세 문서의 각 절 참조 — 요약)
- 수동 입장 → 키오스크 즉시 "이용중", 타석 PC 타이머 ≤15초, 만료 시 cron 자동 반납, unpaid 표시, 중복 409.
- 수동 종료 → 세션 completed/타석 available/키오스크 잠금/exit 자동화, agent ≤15초 반영.
- 오버레이: 11분↑ 아무것도 안 뜸 / 10분↓ 컴팩트 바 / [확인] 후 재등장 없음 / [연장+60분] 즉시 반영 / 0분 잠금.

---

## 2. 사전 운영 작업 (구현보다 먼저 확인)

| # | 항목 | 상태 | 할 일 |
|---|---|---|---|
| 1 | **Vercel 배포 멈춤** | origin/main은 feba72e인데 프로덕션에 `/api/cron/close-expired-sessions`가 404 = **07-05 이후 배포 안 됨** | Vercel → Deployments에서 실패 원인 확인 후 재배포. 로컬 `npm run build` 통과 여부 먼저 확인 |
| 2 | `CRON_SECRET` | 로컬 .env.local ✅ / Vercel ❌ | 사용자가 Vercel 대시보드에 직접 입력해야 함 (채팅/코드에 값 노출 금지). 등록 후 재배포 |
| 3 | 배포 후 크론 검증 | — | 시크릿 없이 GET → 401, `Authorization: Bearer $CRON_SECRET` → 200 `{ok:true,...}` 확인 |
| 4 | Supabase 마이그레이션 | `supabase/migrations/202607080001_bays_unique_bay_code.sql` (bay_code unique) 미적용 | SQL Editor에서 실행 (중복 타석 데이터는 07-08에 정리 완료, 바로 실행 가능) |
| 5 | `AGENTS.md` 생성 (선택) | 없음 | §0 규칙을 저장소 루트 AGENTS.md로 명문화 |

---

## 3. 현재 시스템 상태 스냅샷 (2026-07-12 기준)

- 타석: A-01/02/03 정확히 3개(중복 제거됨), 모두 available. 활성 세션 0. 테스트 데이터 정리 완료.
- 에이전트: 3타석 토큰 등록 완료(agent_devices), 실기기 Bay-02·03에서 0.3.0 프로덕션 폴링 실증됨.
- 설치 zip: `windows-agent/dist-packager/VISTA-Bay-Agent-설치용.zip` (07-08 빌드, 50% 축소 반영). **B 완료 시 재빌드 필요.**
- HA: bay1_on/bay2_on만 존재. bay3_on/off류/shared는 미생성 (이번 작업 범위 아님 — exit 자동화는 스크립트 없으면 실패 로그만 남기고 종료 자체는 성공 처리).
- 미커밋 변경: `windows-agent/electron-main.js`(50% 축소), `windows-agent/.gitignore`, 신규 문서 3건(codex-spec, 사업기획서_v1, 본 문서), 마이그레이션 1건 — B 작업 시작 전 상태 확인할 것.

## 4. 참고 파일
- 상세 명세: `docs/codex-spec-agent-overlay-and-manual-end.md`
- 점검 체크리스트: `docs/system-health-check.md`
- 사업 맥락(우선순위 근거): `docs/사업기획서_v1.md` §4-4
- 재사용 대상 코드: `src/lib/session-cleanup.ts`, `src/lib/kiosk.ts`(startKioskSession), `src/app/api/kiosk/walk-in/start/route.ts`, `src/app/admin/dashboard/dashboard-client.tsx`, `windows-agent/electron-main.js`
