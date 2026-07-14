# codex 작업 명세 — 관리자 수동 입장/이용종료 + Agent 오버레이 재설계

작성일: 2026-07-08 · 갱신: 2026-07-12 (A-2 수동 입장 추가) · 대상: codex · 검토: fable(Claude)
전제: 현재 서버·토큰·세션 체인은 정상 실증됨. Windows Agent는 `windows-agent/`의 Electron 앱(현재 버전 0.3.0, `sessionSource: server`).

---

## A. 기능 1 — 관리자 수동 입장 / 수동 이용종료 (한 쌍)

배경: 무인 시스템이지만 관리자가 매장에서 직접 손님을 받는 경우(반무인 운영)가 실제로 발생한다.
이때 시스템에 세션이 없으면 키오스크가 그 타석을 새 손님에게 배정할 수 있고(현장 충돌),
타이머·자동반납·미수금 기록도 모두 빠진다. 관리자 화면에서 **입장과 종료를 모두** 처리할 수 있어야 한다.

### A-1. 수동 이용종료

### 문제 (현재 상태)
- `/admin/dashboard`의 "전원 OFF/종료" 버튼(`handlePowerOff`, [src/app/admin/dashboard/dashboard-client.tsx:292](../src/app/admin/dashboard/dashboard-client.tsx))은 **불완전**하다.
  - `syncBayStatus(bay,"available")` → `bays.status`만 UPDATE.
  - `access_sessions`를 `completed`로 만들지 않음 → 세션이 계속 `active`.
  - HA `exit` 자동화(조명·PC OFF)를 호출하지 않음 (로그 문구만 있고 실동작 없음).
  - `kiosk_sessions` 잠금 안 함.
  - 결과: "타석 available인데 세션 active" 불일치 + 장비 계속 ON + 해당 타석 agent가 계속 타이머 표시.
- `/admin/automation`의 "종료" 버튼은 onClick 없는 목업.
- **만료 전 수동 종료 수단이 없음.** 완전 종료 로직은 cron `closeExpiredSessions`(만료 후 자동)뿐.

### 목표
관리자가 특정 타석/세션을 **완전하게** 즉시 종료할 수 있게 한다:
`access_sessions=completed` + `kiosk_sessions` 잠금 + `bays=available` + HA `exit` 자동화.

### 구현 지침
1. **공용 로직 추출**: `src/lib/session-cleanup.ts`의 `closeExpiredSessions` 내부 "세션 1건 종료" 부분을 `closeSingleSession(supabase, accessSessionId)` 함수로 추출해 재사용한다. (중복 종료 방지 위해 `.in("status", ["active","extended","overdue"])` 조건부 업데이트 유지.)
2. **새 API 라우트**: `POST /api/admin/session/end`
   - 인증: **관리자 전용**. 기존 보호된 admin mutation과 동일한 방식(미들웨어 세션 + 서버측 service role). 키오스크/agent 시크릿과 혼용 금지.
   - 입력: `{ accessSessionId }` 또는 `{ bayId }`(bayId면 해당 타석의 현재 active/extended 세션을 찾아 종료).
   - 처리: `closeSingleSession` 실행(세션 완료 → kiosk 잠금 → bay available → `runBayAutomation(exit)`).
   - 응답: `{ ok, bayId, automationStatus, message }`. 자동화 실패해도 세션/타석 종료는 성공 처리하고 `automationStatus:"failed"`로만 표기(만료 cron과 동일 정책).
3. **대시보드 연결**: `handlePowerOff`를 위 API 호출로 교체. 성공 시에만 로컬 상태를 available로 갱신. 로그 문구는 실제 결과(automationStatus) 기준으로 표기(장비 OFF 실패 시 "장비 OFF 실패 — 매장 확인 필요"로).
4. **확인 다이얼로그**: 실수 방지로 "○○ 타석 이용을 종료할까요? (손님 화면 잠금 + 장비 OFF)" confirm 후 실행.

### A-1 수용 기준
- active 세션이 있는 타석에서 "종료" 클릭 → DB에서 `access_sessions.status=completed`, `completed_at` 기록, `bays.status=available`, `kiosk_sessions.is_locked=true` 확인.
- 해당 타석 agent가 다음 폴링(≤15s)에서 세션 없음/잠금으로 전환.
- HA 스크립트(`exit`)가 실제 호출됨(스크립트 미비 시 실패로 표기되되 종료 자체는 성공).

### A-2. 수동 입장 (신규)

관리자가 현장에서 직접 받은 손님을 대시보드에서 정식 세션으로 등록한다.

**구현 지침**
1. **새 API 라우트**: `POST /api/admin/session/start`
   - 인증: A-1과 동일한 관리자 전용 방식.
   - 입력: `{ bayId, durationMinutes, guestName? }` — `durationMinutes`는 기존 `reservation-policy.ts`의 `durationOptions`(30/60/90/120)만 허용, 보너스 시간(`getBlockMinutes`) 동일 적용.
   - 처리: **키오스크 워크인 로직 재사용** (`/api/kiosk/walk-in/start`의 흐름 = walk_in 예약 생성 → `startKioskSession`). 중복 구현 금지 — 공용 함수로 추출해 두 라우트가 같은 코드를 쓰게 한다.
   - 구분 표기: 예약 `channel`은 `walk_in` 유지하되 `memo`에 "관리자 접수" 명시 (정산 시 키오스크 셀프 입장과 구분 가능하게). `guest_name` 기본값 "현장 고객(관리자)".
   - 후불 미결제 memo(금액 포함)는 워크인과 동일하게 기록 → `/admin/unpaid`에 잡히게.
   - 타석이 이미 사용 중/예약 겹침이면 409 반환 (DB 배타 제약이 백스톱).
2. **대시보드 연결**: available 타석 카드의 "입장 처리" 버튼(현재 가짜 `handleCheckIn` — 로컬 상태 + bay status만 변경, 90분 하드코딩)을 위 API 호출로 교체. 클릭 시 **이용시간 선택(30/60/90/120분)** 후 확정. 성공 시 실제 세션 기반으로 화면 갱신.
3. **자동화**: `startKioskSession`이 enter 자동화를 부르므로 별도 처리 불필요 (PC가 이미 켜져 있어도 스크립트는 무해).

**A-2 수용 기준**
- 대시보드에서 [타석 + 60분 + 입장] → `reservations`(walk_in, 관리자 접수 memo) + `access_sessions`(active) + `kiosk_sessions` 생성, `bays.status=in_use`.
- 키오스크가 해당 타석을 즉시 "이용중"으로 표시·배정 제외.
- 타석 PC agent에 타이머 표시(≤15s), 시간 만료 시 cron이 자동 반납.
- `/admin/unpaid`에 미결제 금액 표시.
- 이미 세션 있는 타석에 재시도 → 409, 이중 세션 생성 안 됨.

---

## B. 기능 2 — Agent 오버레이 동작/디자인 재설계

### 현재 동작 ([windows-agent/electron-main.js](../windows-agent/electron-main.js) `determineMode`, `getWindowBounds`)
- 세션 없음 → `mini` (항상 "대기/세션 없음" 바 표시)
- 세션 있고 남은시간 > 10분 → `mini` (**남은시간 바가 화면에 계속 떠 있음** ← 사용자 불만: 거슬림)
- 남은시간 ≤ 10분(`warningBeforeMinutes`) → `warning` (**화면 중앙 큰 팝업** ← 사용자 불만: 너무 큼)
- 남은시간 ≤ 3분(`criticalBeforeMinutes`) → `warning`(빨강)
- 남은시간 ≤ 0 → `lock` (전체화면)
- (참고: 직전 작업으로 창을 50% 축소 + `zoomFactor 0.5` 적용해 둔 상태. 이번 재설계로 mini/warning 규격은 대체됨.)

### 원하는 동작 (재설계)
설계 의도: **평소엔 아무것도 안 뜨고, 종료 10분 전부터만 작은 알림이 뜬다.**

1. **평소(남은시간 > 10분 또는 세션 없음)** → **오버레이 완전히 숨김**(창 표시 안 함). 게임 화면을 가리지 않는다. "대기/세션 없음" 상시 바 제거.

2. **종료 10분 전(남은시간 ≤ `warningBeforeMinutes`)** → **작은 알림 바**를 화면 우측 상단에 표시.
   - 내용: `타석번호` / `남은 시간(mm:ss)` + 우측에 버튼 2개.
   - 버튼: **[확인]**, **[연장]**
     - **[확인]**: **아무 일도 일어나지 않음** = 알림 바만 숨김(그 세션 동안 dismiss). 시간은 그대로 계속 카운팅. 게임으로 복귀. (기존 `dismissedWarningSessionId` 로직 재사용)
     - **[연장]**: 아래 3번의 연장 다이얼로그를 연다.
   - 크기: 기존 warning 중앙 팝업보다 훨씬 작게. 미니 바 수준의 컴팩트한 가로 바(예: 폭 360, 높이 96 내외, 우상단 고정). 정확한 픽셀은 codex 재량이되 "작게".

3. **[연장] 클릭 시 연장 다이얼로그**(확인창 스타일의 작은 모달):
   - 기본값 **30분** 표시.
   - **[+]** 버튼: 누를 때마다 **+30분** 누적(30→60→90…). (선택: [−]로 감소, 최소 30분) 상한 없음(관리자 승인이 게이트 역할).
   - **요금 표시 없음** (사용자 결정).
   - **[연장] 확인 버튼: 누른 즉시 연장 적용(auto).**
     - 기존 `requestExtension()` → `POST /api/agent/extension-request` 재사용하되, 고정 `config.extensionMinutes` 대신 **선택된 분**을 `requestedMinutes`로 전송.
     - store `extension_mode`는 **`auto`**(즉시 반영)로 동작: 요청 즉시 세션 `ends_at`이 연장되고, agent 다음 폴링(≤15s)에서 **남은시간이 늘어난다**. (손님은 관리자 승인을 기다리지 않는다.)
   - **[취소]**: 다이얼로그 닫고 알림 바로 복귀.
   - 처리 후 바/다이얼로그에 "○○분 연장되었습니다" 짧게 표시.

4. **재알림 없음** (사용자 결정): [확인]으로 닫으면 그 세션 동안 알림 바는 **다시 뜨지 않는다**. 종료 3분 전 critical 재알림 로직은 **제거**한다.

5. **남은시간 0(종료)** → **전체화면 잠금(lock)** 유지. "이용 시간이 종료되었습니다 / 연장 또는 퇴실 필요" 안내. (기존 유지, 크기는 전체화면 그대로)

6. **관리자는 연장 내역을 "정산용"으로만 확인** (승인 게이트 아님).
   - 연장은 손님이 누르면 **즉시 적용**되므로 별도 승인 화면은 **불필요**.
   - 다만 후불(계좌이체) 정산을 위해 **연장된 시간/금액이 관리자에게 보여야** 한다: 각 연장이 `extension_requests`에 기록되고, **미수금/이용내역(`/admin/unpaid` 등)에 연장분 요금이 합산**되어 관리자가 나중에 확인·정산할 수 있게 한다.
   - 즉 "시간만 관리자가 확인" = 사후 정산 확인이지, 실시간 승인이 아니다.

### 구현 힌트
- `determineMode`: `> warning` 구간을 `mini`가 아니라 **`hidden`**(창 없음)으로 바꾼다. `warning` 구간은 새 컴팩트 바. `lock`은 유지.
- `hidden` 상태에서는 `ensureWindow`가 창을 만들지 않거나 숨기고, heartbeat 폴링은 계속 돈다.
- 렌더러([windows-agent/renderer/index.html](../windows-agent/renderer/index.html), `renderer.js`, `styles.css`): 기존 `mini-card`/`warning-card` 대신 컴팩트 바 + 연장 다이얼로그 UI로 재구성.
- 시니어 대상: 버튼 크게, 글자 크게, 터치/클릭 쉬운 간격.

### 수용 기준
- 남은시간 11분↑: 화면에 아무 오버레이도 안 뜸.
- 10분↓: 우상단에 작은 바(타석/남은시간/**[확인][연장]**) 등장.
- **[확인]**: 바 사라지고 시간은 계속 카운팅, **그 세션 동안 재등장 안 함**.
- **[연장]**→[+]로 60/90분 선택→확인: **즉시** 세션 `ends_at` 연장 → agent 다음 폴링(≤15s)에서 남은시간 증가. 연장분이 `extension_requests`에 기록되고 미수금/이용내역에 요금 합산.
- 0분: 전체화면 잠금.

---

## C. 확정된 결정 (사용자 확인 완료)
1. **버튼 = [확인] + [연장]** (손님용 즉시 종료 버튼 없음).
   - [확인] = 아무 일도 안 함(바만 숨김).
   - [연장] = 손님이 누르면 **즉시 연장 적용(auto)**. 관리자는 사후 정산용으로 시간만 확인(승인 게이트 아님).
2. **연장 요금 표시 없음.**
3. **연장 상한 없음.**
4. **재알림 없음** (3분 전 critical 재등장 제거).

## D. 참고 — 현재 정책 값
- `warningBeforeMinutes`=10, `criticalBeforeMinutes`=3 (store_settings/`getStoreExtensionSettings`, [src/lib/agent-server.ts](../src/lib/agent-server.ts))
- `extension_minutes`=30, `extension_price`=6000 기본
- 연장 API: `POST /api/agent/extension-request` (`accessSessionId`, `requestedMinutes`, `priceAmount`), Bearer=agentToken
- 세션 폴링: `GET /api/agent/session` 15초 간격, `remainingSeconds` 서버 계산

## E. 범위 밖(이번 작업 아님)
- HA 스크립트 실제 생성(bay_off/shared_off 등)은 별건. 본 작업은 호출부만 정확히.
- Vercel `CRON_SECRET` 설정(운영 이슈, 코드 아님).
