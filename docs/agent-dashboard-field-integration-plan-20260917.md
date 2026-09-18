# A-02 현장 Agent와 관리자 대시보드 통합 구현 계획서

작성: 2026-09-17, Codex
대상 저장소: `C:\Users\ting\Documents\Vista_m`
현장 전달본: `C:\VISTA\agent전달문서최종`
대상 화면: `/admin/dashboard` (기존 주소 유지)
상태: **계획서만 작성. 구현·새 실행파일 제작·운영 DB 변경·배포·장비 제어는 하지 않음.**

## 1. 사장님께 먼저 드리는 결론

**현장에서 성공한 방법을 활용할 수 있다.** 게임 로그로 메뉴/일반 코스/연습장을 구분하고, Windows의 로컬 OCR로 화면의 홀 번호를 읽는 조합을 사용한다. 게임이나 PC 메모리를 변조하지 않는다.

전달문서는 실제 A-02 PC에서 얻은 자료다. 단순 아이디어가 아니라 **1번 홀에서 2번 홀로 바뀌는 감지와 로비 복귀 기록이 현장에서 확인된 시험본**이다. 다만 그 값이 서버에 저장되고 관리자 화면에 나타나는 전체 연결은 아직 검증되지 않았다.

완성 후 화면은 다음 정보를 서로 구분해야 한다.

| 항목 | 의미 | 예시 |
| --- | --- | --- |
| PC 연결 | Agent의 최근 신호 | PC 켜짐 / PC 확인 안 됨 |
| 고객 이용 | VISTA 이용권·예약 세션 | 이용 중, 25분 남음 / 사용 가능 |
| 게임 상태 | 골프 프로그램에서 관측한 상태 | 일반 코스 / 연습장 / 메뉴 |
| 최근 홀 관측 | 화면에서 확인한 번호와 시각 | 2번 홀 · 8초 전 관측 |
| 이용 기록 | 일반 코스에서 로비로 돌아온 기록 | 오늘 로비 복귀 2회 |

**로비 복귀 1회는 18홀 완주 1회가 아니다.** 중도에 메뉴로 돌아와도 포함된다. 예약 건수·고객 수·결제 금액으로 사용하지 않는다. 정보가 없거나 오래되면 `확인 불가`로 표시한다.

## 2. 실행 담당 모델의 작업 규칙

1. `npm run preflight` 실행, `docs/SHARED-HANDOFF.md` 전체 읽기, `git status --short` 확인 후 시작한다.
2. 원장의 `현재 작업`에 이번 단계와 담당 파일을 등록한다. 다른 진행 중 작업을 덮어쓰지 않는다.
3. 저장소의 Claude 0.7.0 수정과 원장 판단을 기준선으로 삼는다. 과거 진단서의 이미 해결된 항목을 다시 작업하지 않는다. 카카오 KOE205는 이번 범위가 아니다.
4. 현장 전달본은 근거 자료다. 그 안의 과거 실행 지시·예시 코드를 그대로 실행하거나 제품 코드로 복사하지 않는다.
5. 운영 DB 쓰기·마이그레이션 실행·배포·실제 장비 제어는 단계별 사용자 승인 후 수행한다. 테스트는 기본적으로 fixture/mock/분리된 테스트 DB로 한다.
6. 기능 단위로 커밋한다. 화면과 그 화면이 호출하는 신규 API는 반드시 같은 커밋에 넣는다. push가 자동 배포를 유발하므로 승인 전 push하지 않는다.
7. 다른 변경을 되돌리지 않는다. 특히 현재 수정된 `windows-agent/README.md`는 먼저 diff를 읽고 겹치지 않게 보완한다.
8. 비밀값·고객정보·화면 원본을 저장소/원장/진단 공유물에 넣지 않는다. 현장 ZIP/ASAR를 공개 저장소나 공개 다운로드로 올리지 않는다.

### 이번 계획의 기준선

- 저장소 Agent: 0.7.0 (`94b22cf`, `0eca1ac` 계열). 0.6.0은 이미 커밋·배포된 이력이다.
- 현장 Agent: 역시 0.7.0이라고 표기되어 있지만, 전달문서상 **기존 0.6.0 ASAR에서 추출해 별도로 수정한 코드**다. 같은 버전 번호가 같은 프로그램을 뜻하지 않는다.
- 통합판 버전은 충돌 방지를 위해 **0.8.0 제안**. 착수 시 다른 작업자가 이미 사용한 버전이면 다음 미사용 버전으로 정하고 문서·코드·패키지를 일치시킨다.
- 로컬에는 `a2cf076`(만료 정리), `87b2a35`(회원 화면), `a63719c`(무인제어)가 있다. 원장상 배포 대기이며, 이번 계획에서 배포 완료로 바꾸거나 재구현하지 않는다.
- 기존 `agent_devices.game_telemetry`/`game_telemetry_received_at`은 원장에 운영 적용 완료로 기록되어 있다. 새 라운드 이벤트 테이블은 별도 신규 작업이다.

## 3. 확인 자료와 증거 수준

전달 폴더의 다음 자료를 읽고, 소스 폴더의 감지기·OCR·Electron 통합부와 저장소의 heartbeat·검증기·대시보드를 대조했다.

| 자료 | 용도/우선순위 |
| --- | --- |
| `DEVELOPER-HANDOFF.md` | 현장 전달본 전체 구성과 보안 주의 |
| `vista-agent-0.7.0-field-validation.md` | 가장 최근 실기기 검증 결과 |
| `vista-agent-0.7.0-build-and-test.md` | 빌드 경로, 온라인/오프라인 시험 구분 |
| `vista-current-hole-detection-design.md` | 감지 설계 의도. 뒤의 실측 결과와 실제 코드로 구현 범위를 구분 |
| `vista-agent-v0.6.0-diagnostic-and-improvements.md` | 과거 문제 이력. 현재 수정 지시로 재사용하지 않음 |
| `vista-agent-diagnostic-handoff.md` | 더 이전 버전 이력 |
| `VISTA-Bay-Agent-0.7.0-source/` | 코드 병합 재료. 이 폴더를 저장소 전체에 덮어쓰지 않음 |

### 현장 문서에서 확인된 사실

- 실제 게임 창 이름: `NewGameViewportClientWindow`, 시험 캡처 크기: 1920×1080.
- OCR 출력 `Hole1 Par3`, `Hole2 Par4`를 이용해 같은 `roundId`에서 1→2번 홀을 확인했다.
- 일반 코스에서 로비로 돌아온 뒤 `menu / ended_unclassified` 및 `returned_to_lobby` 이벤트 1건을 확인했다.
- 현장 문서는 Node 테스트 11개 통과를 보고한다. **이번 계획 작성 중 재실행하거나 실게임을 재검증한 것은 아니다.**
- 현장 기본 설정 파일의 창 이름 패턴과 실제 창 이름은 다르다. 시험 프로필의 보정을 운영 기본값에 반영해야 한다.
- 로컬 누적 횟수에는 과거 시험·중복 모니터 실행 흔적이 포함된다. 그 숫자를 운영 DB로 이관하지 않는다.

### 아직 증명되지 않은 것

- 3~18번 홀 전체, 9→10·17→18 전환, 결과표/팝업/로딩 화면의 오탐 여부.
- 다른 해상도·DPI·전체화면·모니터 배치·원격 접속 해제 시 캡처 안정성.
- 서버 저장 → 관리자 화면 표시까지의 왕복, 여러 번의 오프라인 복귀 기록 재전송.
- 18홀 완주와 중도 복귀를 구분하는 확정 신호. `GameSave.bin`의 홀 필드도 미확정이다.
- 운영 화면의 현재 배포 상태. 이번 작업은 저장소 코드를 검토했으며, 운영 대시보드 조회/장비 실행으로 검증하지 않았다.

## 4. 통합 전 반드시 해결할 차이

다음은 Claude의 과거 판단을 재검증한 목록이 아니라, **새 현장 코드와 현재 서버를 연결할 때 필요한 변경점**이다.

| 위치 | 소스 대조 결과 | 통합 방침 |
| --- | --- | --- |
| `src/lib/game-telemetry.ts` | `schemaVersion: 1`과 고정 enum만 허용. 현장 `screen_golf_log`, `ended_unclassified`, 신규 reason 일부는 거절되고, mode/hole metadata/event는 반환 객체에서 빠짐 | v1 호환을 유지한 v2 정규화 계약부터 구현 |
| `src/app/api/agent/heartbeat/route.ts` | `gameUsage`·복귀 이벤트 저장 경로 없음. optional telemetry가 거절돼도 heartbeat 자체는 성공 가능 | telemetry 수락 결과와 이벤트 ACK를 별도로 반환 |
| `src/lib/agent-server.ts` | telemetry 읽기 후 update라 동시 요청이 오래된 값을 마지막에 쓸 수 있음 | DB에서 원자적으로 새 표본만 수락 |
| 저장소 `screen-golf-monitor.js` | Practice/Tutorial/Test 제외, exit→aborted, 시작 시 과거 로그 제외가 이미 구현됨 | 이 동작과 기존 테스트 유지 |
| 현장 `screen-golf-monitor.js` | Practice만 분류, exit는 reason만 변경, 시작 시 로그 꼬리를 재생 | 통째로 교체 금지. course/round ID·OCR 연결·복귀 이벤트만 선별 이식 |
| 현장 `screen-hole-detector.js` | 최근 N개 샘플 수는 제한하지만 샘플의 시간창 제한은 없음. `observedAt`은 OCR 완료 시점에 부여됨 | 실제 캡처 시각 기준, 오래된 후보 제거, 지연 응답 폐기 |
| 같은 감지기 | 여러 후보 창 중 큰 창 선택, ROI 없이 게임 창 전체 OCR 가능, 캡처 실패 시 다른 창 제목들을 로그에 기록 | 운영은 식별된 게임 창+검증된 ROI만 사용. 전체 창 제목 로그 제거 |
| 현장 `electron-main.js` | `tick()`이 OCR 포함 `refreshGameTelemetry()`를 기다림. OCR subprocess 타임아웃 7초 | 시간 제어 tick과 OCR를 분리. 최신 완료 표본과 원래 관측 시각만 전송 |
| 현장 복귀 기록 | JSONL에서 로컬 합계 복원. 서버로 마지막 이벤트·합계만 전송하며 ACK 큐가 없음 | 합계 전송 대신 영속 outbox와 이벤트별 ACK 구현 |
| 현장 `recordRoundEnded` | 파일 기록 성공 전 메모리 합계가 먼저 증가 | 영속 기록 성공 후에만 전송 가능 상태로 승격 |
| 대시보드 `getGameStatusDisplay` | 메뉴 분기가 종료 표시보다 먼저이며 mode·holeStatus·복귀 이력 표시 없음 | 현재 화면과 최근 복귀 기록을 각각 렌더 |
| 패키지 | 현장 문서상 ASAR에 실제 타석 토큰 포함. 저장소 package build.files에도 local 설정 포함 | 신규 배포본은 비밀값 외부화, 패키지 내부 검사 필수 |

## 5. 최종 설계 결정

### 5.1 상태 감지

`실제 게임 프로세스 → 읽을 수 있는 ScreenGolf.log → 게임 창 HUD OCR` 순으로 결합한다.

- 프로세스 감지는 실행 여부만 알려준다. 이용권 세션의 `status=playing`을 게임 판정으로 쓰지 않는다.
- 로그의 코스 진입은 일반 코스 화면에 들어갔다는 뜻이다. 실제 타격·플레이어 존재를 증명하지 않으므로 UI는 `일반 코스`라고 표시한다.
- `Practice_`, `Tutorial_`, `Test_`는 정규 이용 집계에서 제외한다. 모르는 맵은 설정된 분류 근거 없이는 정규 코스로 단정하지 않는다. A-02에서 확인된 일반 코스 목록부터 등록한다.
- `SGGameModeBase_C` 한 줄만으로 정규 라운드를 만들지 않는다.
- 현재 홀은 검증된 HUD에서만 읽는다. 코스 진입을 보고 무조건 1홀이라고 만들거나 PAR·스코어·거리 숫자를 읽지 않는다.
- `currentHole`은 화면에 적힌 번호다. 9홀 코스 반복 등에서 전체 라운드 몇 번째 홀인지는 알 수 없으므로 `roundHoleOrdinal`은 이번 범위에서 제공하지 않는다.
- 잠긴 native 로그를 강제로 열거나 게임 파일을 수정하지 않는다. 미확정 `GameSave.bin` 오프셋 파서는 제외한다.

### 5.2 기존 운영 로직과 격리

- OCR 실패/정지/예외가 예약·이용시간·경고·연장·잠금·장비 종료에 영향을 주면 안 된다.
- 프로세스/로그 관측과 OCR 작업을 별도 비동기 루프로 구성한다. OCR는 동시에 하나만 실행하며 밀린 요청을 쌓지 않는다.
- OCR 완료까지 기다린 후 시간 제어를 하는 현장 tick 구조는 채택하지 않는다. 단순히 `void refresh...`로 되돌리지도 않는다. 완료된 표본의 관측 시각과 freshness를 검사하여 전송하고, 미완료/만료 표본은 unknown으로 만든다.
- OCR 작업 시작 시 `monitorInstanceId`, `gameInstanceId`, `contextEpoch`, `layoutVersion`, 캡처 시각을 보관한다. 완료 시 하나라도 바뀌면 결과를 버린다.
- 캡처 자체와 OCR subprocess 모두 제한 시간을 둔다. 시간 초과 후 늦게 돌아온 Promise가 상태를 갱신하지 못하게 한다.
- 게임 실행 중 Agent 재시작은 기본적으로 파일 끝을 기준점으로 삼는다. 검증되지 않은 과거 로그 재생으로 현재 상태를 복원하지 않는다. 새 코스 신호 전까지 `실행 중 · 상태 확인 불가`가 허용되는 MVP 제한이다.

### 5.3 홀 판정과 시간 기준

- 운영 OCR는 A-02에서 확인한 창 이름을 포함하고, 게임 프로세스에 속한 창인지 확인할 수 있는 어댑터를 둔다. 후보가 복수이거나 소속이 불명확하면 unknown. 임의로 가장 큰 창/전체 바탕화면으로 대체하지 않는다.
- 실제 창 캡처 크기에 대해 검증된 정규화 ROI를 사용한다. 전달문서의 예시 ROI 좌표를 운영 좌표로 복사하지 않는다. ROI 미설정/레이아웃 불일치면 OCR 비활성 상태를 알린다.
- 기본 샘플 시도 간격 2초, 최근 **6초 내 서로 다른 실제 캡처 3개 중 2개 일치**로 확정한다. 현장 설계의 3초 시간창은 2초 주기 및 OCR 지연과 맞지 않아 이 계획에서 명시적으로 조정했다.
- 실패/충돌 표본도 시간 순서에 포함하고, 6초 밖의 일치 후보로 확정하지 않는다. 같은 캐시 프레임에 새 ID만 붙여 신선한 근거로 사용하지 않는다. 실제 재캡처한 정지 화면은 숫자가 같아도 유효하다.
- 최신 확정 근거가 5초를 넘으면 **로컬 currentHole=null, holeStatus=stale**. 마지막 번호는 `lastKnownHole`에만 유지한다.
- 번호가 바뀌는 첫 후보에서는 `transitioning`, 둘 이상의 홀 후보는 `conflict`. 로비/연습장/종료에서는 즉시 `not_applicable`로 초기화한다.
- 번호 역행·점프를 +1로 교정하거나 완주 추정에 쓰지 않는다. 재확인 후 실제 표시된 값만 사용한다.

### 5.4 전송·화면 주기: MVP는 기존 주기 유지

서버 함수 호출량과 구현 범위를 늘리지 않도록 **기존 heartbeat 약 15초와 대시보드 새로고침 15초**를 우선 유지한다. 별도 고빈도 telemetry API, 실시간 스트리밍은 이번 필수 범위가 아니다.

- 로컬 홀 확인 목표는 정상 조건에서 약 5초 이내. 서버/대시보드는 별도이며, 정상 네트워크의 새 관측 반영 목표는 **35초 이내**다. 아직 실측 완료된 성능이 아니다.
- 대시보드의 홀 값은 `최근 홀 관측`이고, `n초 전 관측`을 같이 표시한다. 초 단위 실시간 현재값이라고 표현하지 않는다.
- 홀 값은 `holeObservedAt` 기준 35초, 전체 telemetry는 관측/서버 수신 시각 기준 45초가 지나면 unknown. 프런트에서 매초 경과를 계산하여 새 응답이 없어도 만료시킨다.
- 로컬 stale/null 표본이 도착하면 35초를 기다리지 않고 바로 번호를 지운다. 35초는 전송 간격을 고려한 **원격 표본 보존 한계**이며 로컬 5초 규칙을 대체하지 않는다.
- PC 연결의 기존 120초 기준은 그대로 둔다. PC는 켜졌지만 홀은 확인 불가인 상태가 정상적으로 가능하다.
- 현장 사용자가 더 빠른 반영을 원하면 후속 단계에서 상태 변경 전송을 검토한다. 이번 구현자가 임의로 모든 폴링을 1~3초로 줄이지 않는다.

## 6. 서버 계약: v2 + 기존 v1 호환

### 6.1 표본 예시

아래 식별자는 형식 설명용이며 실제 값/토큰이 아니다. `monitorInstanceId`, `gameInstanceId`, `roundId`는 구현에서 UUID로 생성한다.

```json
{
  "schemaVersion": 2,
  "monitorInstanceId": "<agent-run-uuid>",
  "sampleSequence": 104,
  "gameInstanceId": "<game-process-instance-uuid>",
  "contextEpoch": 3,
  "gameRunning": true,
  "gameState": "playing",
  "gameMode": "regular",
  "courseId": "<verified-course-id>",
  "roundId": "<round-uuid>",
  "roundStatus": "in_progress",
  "currentHole": 2,
  "holeStatus": "confirmed",
  "holeSource": "ocr",
  "holeObservedAt": "2026-09-17T07:00:00.000Z",
  "lastKnownHole": 2,
  "lastKnownHoleAt": "2026-09-17T07:00:00.000Z",
  "stateSource": "mixed",
  "confidence": "high",
  "observedAt": "2026-09-17T07:00:01.000Z",
  "reasonCode": null,
  "detectorVersion": "screen-golf-0.8.0",
  "layoutVersion": "a02-hud-v1"
}
```

- `observedAt`은 완료한 새 상태 관측 시각, `holeObservedAt`은 채택한 실제 프레임 캡처 시각이다. 재전송 시 새 시각으로 덮지 않는다.
- `confidence=high`는 아래 조건을 만족한 관측 등급이지 통계적 99% 정확도나 고객이 플레이 중이라는 보증이 아니다.
- Agent 버전은 기존 heartbeat의 `agentVersion`, 배포 식별은 빌드 manifest로 관리한다.
- `lastRoundEvent`는 현재 상태 계약에 넣지 않는다. 아래 별도 이벤트 배열로 전달한다. 현장 내부 last event를 UI 보조로 쓰더라도 서버 집계의 입력으로 중복 사용하지 않는다.

### 6.2 enum 및 불변 조건

| 필드 | v2 허용값/규칙 |
| --- | --- |
| `gameRunning` | true / false / null |
| `gameState` | unknown, not_running, menu, playing, practice, exiting, paused, results |
| `gameMode` | unknown, none, lobby, regular, practice, excluded |
| `roundStatus` | unknown, not_started, in_progress, ended_unclassified, aborted, not_applicable, completed |
| `holeStatus` | unknown, confirmed, transitioning, stale, not_applicable, conflict |
| `stateSource` | 기존 source enum 유지. 현장 screen_golf_log는 log로, 로그+OCR는 mixed로 변환 |
| `holeSource` | null 또는 ocr. 향후 다른 감지기를 추가할 때 계약 확장 |
| `currentHole` | null 또는 1~18 정수. 현장 HUD 범위 밖은 추측하지 않음 |
| `courseId` | 검증된 짧은 맵 식별자, 최대 128자. 전체 로컬 경로나 원문 로그 금지 |
| `reasonCode` | 기존값 + practice_map, excluded_map, course_unclassified, returned_to_lobby, exit_during_round, recognition_pending, recognition_rejected, recognition_ambiguous, recognition_timeout, recognition_failed, source_stale, capture_source_not_found, capture_source_ambiguous, layout_unconfigured, clock_skew |

- `currentHole != null`은 regular + playing + in_progress + confirmed + 유효 `holeObservedAt`일 때만 허용한다. 그 밖에는 null로 정규화하고 이유를 기록한다.
- `gameRunning=false`이면 not_running, mode=none, currentHole=null. 최근 종료 이력은 이벤트에서 별도로 보인다.
- 완주 신호가 확인되지 않은 MVP에서는 `completed`를 생성하지 않는다. 기존 v1의 completed는 레거시 라벨로 처리하고 완주 통계에 넣지 않는다.
- `screen_golf_log`, `screen_ocr`처럼 현장 코드에서 쓰던 이름은 내부 어댑터에서 정식 계약으로 바꾼다. 서버에서 임의 문자열을 모두 받아주는 방식으로 해결하지 않는다.
- v1은 기존 표본을 계속 수용한다. 저장소 Agent가 쓰는 practice/exiting/aborted 및 그 reason도 빠짐없이 테스트한다. 없는 v2 항목은 unknown/null, 로비 복귀 이벤트는 소급 생성하지 않는다.
- size cap: telemetry 8 KiB, heartbeat 전체 32 KiB. 원문/이미지/알 수 없는 추가 키는 저장하지 않는다. request body를 무제한 읽은 뒤 검사하지 않도록 읽기 제한도 둔다.

## 7. 로비 복귀 횟수: 재전송해도 한 번만 기록

### 7.1 집계 정의

- 이벤트 생성 조건: 이번 실행에서 확인한 일반 코스 `in_progress` → 로비. 하나의 `roundId`에 1건.
- `Browse UIMap`와 `BP_LobbyModebase_C`가 이어져도 1건. 연습장·튜토리얼·테스트·분류 불가는 0건.
- 강제 종료/PC 종료는 `aborted` 상태이지 로비 복귀가 아니다. 집계하지 않는다.
- 홀이 18이었다는 사실만으로 completed를 만들지 않는다. `completionKind`는 이번 MVP에서 항상 `unverified`.
- 같은 코스의 실제 재입장과 반복 로그를 구분한다. 로비 전환이나 검증된 새 게임 컨텍스트가 있어야 새 roundId를 만든다.

### 7.2 Agent 이벤트 전송 형태

기존 heartbeat body에 `roundEvents`를 선택적으로 추가한다. 한 번에 최대 20건, 최대 24 KiB. 로컬 총합 `gameUsage.totalReturnedToLobby`를 서버 정산 값으로 보내지 않는다.

```json
{
  "roundEvents": [{
    "eventId": "<event-uuid>",
    "roundId": "<round-uuid>",
    "eventType": "returned_to_lobby",
    "courseId": "<verified-course-id>",
    "occurredAt": "2026-09-17T07:10:00.000Z",
    "completionKind": "unverified",
    "lastKnownHole": 2,
    "lastKnownHoleAt": "2026-09-17T07:09:55.000Z",
    "source": "log",
    "agentVersion": "0.8.0"
  }]
}
```

`occurredAt`은 새 로그의 복귀를 Agent가 관측한 시각이다. 로그 지연/누락이 있으면 정확한 실제 게임 종료 시각이라고 주장하지 않는다.

응답은 기존 `ok`, `receivedAt`, `gameTelemetryAccepted`를 유지하고 다음 선택 필드를 추가한다.

```json
{
  "acceptedGameTelemetrySchemaVersions": [1, 2],
  "roundEventAckIds": ["<event-uuid>"],
  "roundEventRejected": [],
  "roundEventRetryable": true
}
```

- 이미 같은 내용으로 저장된 이벤트는 중복 ACK한다. 같은 eventId에 내용이 다르면 `event_conflict`로 거절한다.
- 일부 저장 성공이면 성공한 ID만 ACK한다. telemetry 실패와 이벤트 실패를 구분한다.
- 운영 migration 미적용/DB 장애라면 heartbeat 핵심 기능은 계속 동작하고 해당 이벤트는 ACK하지 않는다. 서버 로그에는 비밀값 없는 오류 코드만 남긴다.
- 영구적인 형식 오류는 `{eventId, code}`로 반환하여 로컬 격리 목록으로 이동한다. 인증/일시 DB 오류는 백오프 재시도한다.

### 7.3 로컬 outbox

- 새 `round-event-outbox.js`에 작게 분리한다. 이벤트를 디스크에 정상 기록한 후 전송 대상에 올린다. 이벤트 생성 당시 ID와 시각을 재시도 때 유지한다.
- 동일 Windows 사용자·동일 타석 설정에서 재시작해도 미전송 목록이 남아야 한다. 타석을 바꾸면 다른 타석의 outbox를 전송하지 않는다.
- 기록/ACK/압축 중 종료에 대비해 append journal + checkpoint 또는 원자적 임시파일 교체를 사용한다. ACK 전 삭제 금지. 마지막 손상 행은 격리하고 앞의 정상 기록을 보존한다.
- 디스크 실패/용량 상한 시 누적값을 정상으로 꾸미지 않는다. 진단에 `기록 저장 실패`를 남기고 운영 세션은 유지한다. 미ACK 기록을 자동 삭제하지 않는다.
- **현장 시험본의 `round-events.jsonl`은 백업만 한다.** 새 운영 outbox로 자동 가져오지 않는다. 온라인 운영 시작 기준 시각과 새 저장소를 별도로 기록한다.
- MVP는 Agent 재시작 도중의 진행 라운드 ID 복원까지 보장하지 않는다. 기준점 이후 새 코스 진입 전에는 집계하지 않아 과소 집계될 수 있음을 알린다. 과거 로그로 추정해서 빈칸을 채우지 않는다.

### 7.4 DB와 저장 계층

신규 테이블 제안: `agent_round_events`.

필수 컬럼: `event_id` UUID PK, `agent_device_id`, `store_id`, `bay_id`, `round_id` UUID, `event_type`, `course_id`, `occurred_at`, `received_at`, `last_known_hole`, `last_known_hole_at`, `completion_kind`, `agent_version`.

- `UNIQUE(agent_device_id, round_id, event_type)`로 서로 다른 eventId를 가진 같은 복귀도 방지한다. 해당 충돌이 동일 복귀면 요청 ID를 중복 ACK하여 무한 재전송을 막는다.
- store/bay/agent ID는 Bearer 토큰의 등록 행에서 정한다. body ID를 신뢰하지 않는다. RLS 활성화, anon/authenticated 직접 insert/update/delete 금지, 서버 service role 경유만 허용한다.
- 날짜/타석 조회 인덱스 `(store_id, occurred_at DESC)` 및 `(bay_id, occurred_at DESC)`를 둔다.
- 시간은 UTC로 저장, 오늘 통계는 Asia/Seoul 하루의 UTC 시작/끝 구간으로 조회한다. 지연 수신 기록도 수신 날짜가 아닌 관측 날짜에 배치한다.
- 미래 5분 초과 또는 운영 모니터링 시작 이전 기록은 자동 집계하지 않고 거절/격리한다. 정상 과거 미ACK 이벤트는 지연 수신으로 표시한다. 시계 오차가 의심되면 관리자 화면에 알린다.
- 같은 이벤트가 다른 타석 자격증명으로 재생되면 거절한다. eventId 재사용으로 기존 행의 소속이나 내용을 바꾸지 않는다.
- MVP에는 고객/예약 연결과 매출 계산을 추가하지 않는다. 오프라인 과거 이벤트를 현재 accessSessionId에 붙이는 오류를 원천적으로 피한다.
- telemetry는 기존 JSONB 컬럼을 활용한다. `storeAgentGameTelemetry`의 비교+저장을 DB 함수의 행 잠금/조건부 갱신 한 번으로 처리한다. 이 함수는 service role만 실행 가능하게 하고, 함수 search_path와 권한을 migration에 명시한다.
- 같은 monitorInstanceId는 sequence가 큰 것만 수락한다. 다른 인스턴스는 유효 관측 시각이 더 새로울 때만 수락한다. 동일/오래된 표본은 ACK 가능한 중복이지만 freshness 시각은 갱신하지 않는다.
- 서로 다른 PC에서 같은 타석 토큰을 실행하는 것은 지원하지 않는다. 중복 Agent/시계 오차를 감시하고 타석별 설치를 바로잡는다. 완전한 분산 실행권(lease) 도입은 후속 범위다.
- migration은 **추가형**으로 작성한다. 기존 컬럼 삭제/이름변경, 운영 데이터 보정은 금지. 실행은 사용자 승인 후다.

## 8. 서버 API와 관리자 화면 변경

### 8.1 변경 파일

| 파일 | 변경 내용 |
| --- | --- |
| `src/lib/game-telemetry.ts` | v1/v2 discriminated union, enum·크기·불변 조건·freshness 공통 함수 |
| `src/lib/agent-server.ts` | 원자적 telemetry 저장 호출, 수락/중복/거절 결과 |
| `src/lib/agent-round-events.ts` (신규) | 이벤트 검증·서버 소속 주입·멱등 저장·집계 |
| `src/app/api/agent/heartbeat/route.ts` | 선택적 roundEvents/ACK, 하위 호환, 오류 격리 |
| `supabase/migrations/<신규시각>_agent_round_events.sql` (신규) | 이벤트 테이블·제약·권한·telemetry 저장 함수 |
| `src/lib/supabase/bays-server.ts` | v2 상태·Agent 버전 매핑, 기존 PC/세션 동작 유지 |
| `src/lib/dashboard-data.ts` | 게임 표본·복귀 통계·조회 실패/미지원 타입 |
| `src/app/admin/dashboard/page.tsx` | 기존 조회와 독립적으로 게임 요약 조회, 실패 분리 |
| `src/app/admin/dashboard/dashboard-client.tsx` | 타석 카드 게임 상태·관측 시각·복귀 횟수·상세 모달 |
| `src/app/api/admin/game-activity/route.ts` (신규) | 승인된 관리자에게 해당 매장/타석의 페이지 단위 복귀 이력 반환 |

heartbeat를 수정할 때 기존 `accessSessionId`로 kiosk_sessions를 갱신하는 부분도 **인증된 Agent의 store/bay에 속한 세션인지** 확인하는 최소 범위의 가드를 함께 테스트한다. 게임 기능 추가를 이용해 다른 타석 세션을 갱신할 수 없어야 한다.

### 8.2 관리자 조회 권한

현 `requireAdminUser()`는 로그인 존재만 확인한다. **새 게임 이력 API를 단순히 이 helper만 호출한 채 공개하지 않는다.** 기존 고객 로그인 사용자가 관리자 데이터에 접근할 수 없는 관리자/매장 권한 기준이 필요하다.

- 구현 착수 시 현재 프로젝트가 실제 사용하는 관리자 식별 근거를 확인하고 재사용한다. 역할을 임의로 모든 로그인 사용자에게 부여하지 않는다.
- 현재 기준이 없다면 UI+API 활성화 전 사용자에게 관리자 계정 식별 방식(서버측 허용 목록 또는 기존 권한 테이블)을 확정받는다. 새 기능은 그때까지 fail-closed/fixture 상태로 둔다.
- 새 이력 API와 page의 신규 게임 요약 조회 모두 같은 권한 함수를 사용한다. 요청의 임의 storeId/bayId에 service role 전체 조회를 허용하지 않는다.
- API는 읽기 전용, 기본 20건, 최대 100건, cursor 방식. 토큰·경로·원문 로그·화면은 반환하지 않는다.
- 이 권한 가드는 이번에 추가하는 게임 데이터 경로의 배포 조건이다. 기존 모든 관리자 기능의 권한 체계를 한꺼번에 재설계하는 것은 별도 작업이다.

### 8.3 화면 구성

기존 타석 카드 3개/데스크톱 한 줄 구조와 관리자 입장·종료 버튼을 유지한다. 새 대형 섹션이나 장식용 카드 중첩은 만들지 않는다.

```text
A-02                         PC 켜짐
사용 가능                    [기존 세션 상태]

게임  일반 코스
최근 홀  2번 홀 · 8초 전 관측
오늘 로비 복귀  2회           [이력 아이콘]
```

모달에는 타석, 최근 프로그램 상태, 출처·신뢰도·관측/수신 시각, Agent 버전, 최근 복귀 목록을 표시한다. 목록은 `시각 / 코스 식별자 / 마지막 확인 홀 / 로비 복귀 / 지연 수신 여부` 정도로 제한한다.

| 데이터 상태 | 표시 |
| --- | --- |
| regular + confirmed + 유효 시각 | 일반 코스 / 최근 홀 N번 · n초 전 관측 |
| transitioning | 일반 코스 / 홀 확인 중 |
| stale/conflict/unknown | 일반 코스 / 홀 확인 불가. 필요 시 보조 텍스트로 마지막 확인 N번과 시각 |
| practice | 연습장 / 홀 표시 안 함 |
| excluded/unknown mode | 게임 상태 확인 불가 또는 확인된 비집계 모드 |
| 메뉴 + 최근 복귀 이벤트 | 메뉴·대기 / 최근 로비 복귀 HH:mm. 18홀 완주 표기 금지 |
| exiting/aborted | 프로그램 종료 중 / 라운드 중단 감지. 복귀 횟수 증가 없음 |
| v1 completed | 이전 Agent의 종료 신호. 완주 확인으로 표시/집계하지 않음 |
| gameRunning=false | 골프 프로그램 미실행 |
| telemetry 미지원/미수신/오류 | 감지 미지원 / 수신 대기 / 조회 실패를 구분 |
| 이벤트 없음, 조회 정상 | 오늘 로비 복귀 0회 |
| 이벤트 미지원 또는 DB 조회 실패 | 미지원 또는 조회 실패. 0회로 대체하지 않음 |

- 기존 `오늘 예약` 합계와 무관하다. 복귀 횟수를 그 숫자에 더하지 않는다.
- 게임 시작/복귀만으로 고객 이용 세션이나 PC/프로젝터 전원 상태를 바꾸지 않는다.
- 게임 정보 조회를 위해 `getDashboardBays`의 세션 정리 부작용을 추가 호출하지 않는다. 이력 API는 조회만 한다.
- 클라이언트 경과 시각을 반영하며 탭 복귀 시 재조회한다. 네트워크 실패 중 마지막 데이터는 오래된 자료로 표시한다.
- 현재 카드의 PC 상태와 무인제어의 PC 상태 기준은 유지한다. 이 작업에서 전원 토글의 의미를 다시 바꾸지 않는다.

## 9. Agent 파일별 구현과 최종 배포본

| 파일 | 작업 |
| --- | --- |
| `windows-agent/screen-golf-monitor.js` | 기존 수정 유지 + mode/course/round/context + 신규 복귀 이벤트 callback |
| `windows-agent/screen-golf-monitor.test.js` | 기존 회귀 사례 보존, 새 이벤트·중복·과거 로그 케이스 추가 |
| `windows-agent/screen-hole-detector.js` (신규) | 현장 소스 선별 이식 후 ROI·시간창·캡처 시각·컨텍스트 폐기·개인정보 수정 |
| `windows-agent/screen-hole-detector.test.js` (신규) | 현장 5개 테스트 이식 + 실패/지연/오래된 표본 테스트 |
| `windows-agent/hole-ocr.ps1` (신규) | Windows OCR helper, 무창 실행·timeout·정리. 언어 기능 없으면 명확한 미지원 |
| `windows-agent/round-event-outbox.js` 및 테스트 (신규) | 파일 영속성, ACK, 중복, 재시작, 구버전 시험 기록 미이관 |
| `windows-agent/electron-main.js` | 독립 관측 루프·v2 조립·이벤트 전송·안전한 offline 모드 |
| `windows-agent/agent-config.js` | 기존 병합 유지, 외부 credential/monitor 설정 우선순위 명시 |
| `windows-agent/monitor.config.example.json` (신규) | 비밀값 없는 감지 설정, ROI 미보정 시 비활성 |
| `windows-agent/package.json`/lock | 버전/배포 allowlist/테스트 명령 동기화, local secret 포함 제거 |
| `windows-agent/README.md` | 기존 미커밋 변경 보존 후 설치·교체·진단·롤백 안내 보완 |

### 9.1 최종 산출물

**지금 전달받은 ZIP을 최종 운영판으로 이름만 바꿔 배포하지 않는다.** 통합 검증 후 다음 두 패키지를 만든다.

- `VISTA-Bay-Agent-0.8.0-windows-x64.zip`: 운영용 공통 바이너리, 비밀값 없음.
- `VISTA-Bay-Agent-0.8.0-offline-test.zip`: 분리된 test-profile, 눈에 띄는 시험 표시, 서버 통신·세션 변경·종료 명령 실행 불가.
- 함께 `release-manifest.json`: Agent 버전, 소스 commit, 빌드 시각, Electron 실제 버전, exe/asar SHA-256, 지원 telemetry v1/v2, 운영/시험 구분, 필수 서버 migration.
- Electron 프로세스 여러 개는 정상일 수 있다. 운영 단일 인스턴스 잠금과 별개로, 운영 모드에서 TEST_MODE로 잠금을 우회하는 실행 경로를 막는다.
- 이번 기능 통합과 Electron 메이저 버전 교체를 섞지 않는다. 현재 잠금파일/검증된 런타임으로 먼저 빌드하고, 런타임 지원·보안 업데이트는 별도 평가 항목으로 기록한다.
- 빌드 도구는 원장/현행 배포 절차를 우선한다. packager 또는 검증된 런타임+새 ASAR 방식이면 그 절차를 유지한다. 단순히 package.json에 있다는 이유로 과거 실패한 서명/portable 빌드를 반복하지 않는다. 깨끗한 staging에 파일 allowlist로 조립하고, 기존 dist/ZIP/node_modules/비밀설정이 재귀 포함되지 않게 검사한다. 정리할 경로의 절대 위치를 먼저 확인한다.

### 9.2 설치 위치와 설정

표준 설치 폴더 제안: `C:\VISTA\windows-agent\`. 기존 실행 위치가 다르면 먼저 바로가기·시작프로그램·실제 실행 경로를 확인하고 하나로 정리한다. exe 한 개만 복사하지 말고 배포 ZIP의 런타임 폴더 구조 전체를 유지한다.

- 사용자 쓰기 폴더는 기존 `%APPDATA%\vista-windows-agent`를 유지해 타석 선택을 보존한다. 앱명/패키징 차이로 실제 userData가 달라지지 않는지 산출물에서 검증한다.
- `agent.config.json`은 기존 타석 선택 용도를 보존한다. `monitor.config.json`에는 허용된 OCR 설정만 넣는다.
- 타석별 토큰은 신규 사용자 프로필 credential 파일에 **해당 PC 타석 하나만** 저장한다. Windows 사용자 ACL로 제한하고 원문 표시/로그 금지. 초기화/이전 스크립트는 비밀값을 터미널에 출력하지 않는다.
- 기존 ASAR/local 설정에 포함된 토큰을 자동 재포장하지 않는다. 사용자가 승인한 설치 절차로 자격증명을 분리하고, 회전이 필요하면 서버 등록과 해당 타석 설정을 함께 교체한다. 다른 타석 토큰을 공통 ZIP에 넣지 않는다.
- 첫 실행은 설정이 없을 때만 타석 선택. 기존 A-02 설정이 있으면 선택창 없이 실행되는 것이 정상이다. 대신 트레이/진단 화면에서 타석·버전·마지막 통신 결과·OCR 상태를 확인할 수 있게 한다.
- UI 캡처를 수행하므로 실제 게임이 표시되는 로그인 사용자 세션에서 자동 실행되게 시험한다. SYSTEM/비대화형 백그라운드 실행으로도 캡처된다고 가정하지 않는다.
- 시작프로그램은 기존 설치 스크립트를 재사용하고 재부팅 후 자동실행을 확인한다. 이전 exe로 향하는 중복 등록은 사용자 승인 후 정리한다.

### 9.3 개인정보와 진단

- 서버 전송은 정규화 상태/숫자/이벤트만. 화면, OCR 원문, 창 제목 목록, 로컬 경로, 사용자명 전송 금지.
- 현장 소스는 debug=false라도 OCR helper에 넘길 임시 PNG를 만든다. 따라서 `이미지가 전혀 저장되지 않는다`고 설명하지 않는다.
- 운영은 ROI 이미지 임시파일만 현재 사용자 폴더에 두고 finally 삭제한다. 시작 시 이전 실행의 소유가 확인된 잔여 파일만 정리한다. 임의 폴더 재귀 삭제 금지.
- debugSaveLatestFrame은 기본 false. 사용자 승인한 현장 진단에서만 ROI 최신 1장 저장 후 종료 시 삭제한다. 전체 게임 화면 장기 저장은 별도 동의 없이는 금지.
- 설정 오류·화면 찾기 실패·timeout·HTTP 실패·telemetry 거절·미ACK 수만 표시한다. 상세 진단 내보내기는 필드 allowlist로 생성한다.

## 10. 하위 모델용 단계별 작업 패키지

한 단계 완료 후 원장에 검증과 미완료를 적고 다음으로 이동한다. 단계가 끝났다는 이유만으로 배포하지 않는다.

| 단계 | 작업/커밋 경계 | 다음 단계 진입 조건 |
| --- | --- | --- |
| A | 현장 sanitized fixture + v2 계약/테스트. 실제 설정·ASAR는 커밋하지 않음 | 실제 1→2·복귀 예시와 v1 fixture 정규화 통과 |
| B | migration 파일 + heartbeat/저장 helper + 서버 테스트를 한 기능 커밋 | 격리 DB에서 동시성·멱등성·구버전·장애 격리 검증 |
| C | 기존 Agent 로그 수정 보존 + OCR 모듈·독립 루프·로컬 테스트 | stale/잘못된 창/지연 응답에도 시간 제어 정상 |
| D | outbox + heartbeat v2/ACK + 설정 외부화·테스트 | 오프라인 여러 회·재시작·부분 ACK·중복 요청 손실 없음 |
| E | 관리자 게임 요약·카드·상세 이력 API·권한 가드·UI 테스트를 같은 커밋 | 모바일/데스크톱 fixture 및 일반 고객 접근 차단 |
| F | 버전·빌드/패키징·설치/진단 문서·manifest | ASAR 비밀값 없음, 신구 설정 이전, offline 통신 0 |
| G | 사용자 승인 후 migration → 서버/UI 배포 → A-02 교체 → 현장 시험 | 아래 현장 수용표 통과 후 A-01/A-03 확장 |

추가 필수 조건:

- B/E는 서버가 먼저 v1/v2를 모두 이해하도록 완성한다. Agent를 먼저 바꾸고 서버가 따라오기를 기다리는 운영 배포는 금지한다.
- 원장의 기존 대기 커밋까지 배포에 포함되는지 승인 시 함께 설명한다.
- 서버 계약을 의도적으로 깰 때는 Agent fallback부터 정한다. 서버가 v2 미지원이면 이벤트는 로컬 보존, 게임 표시는 미지원, 기존 heartbeat/시간 제어는 계속 유지한다.
- 기능 플래그로 `gameMonitoringEnabled`와 `gameHoleDetectionEnabled`를 기존대로 활용한다. 지원 필드 협상이 안 되는 서버에는 고빈도 재시도를 하지 않는다.
- 권한 기준 확정과 현장 ROI 보정은 담당 모델이 임의로 만들어 완료 처리하면 안 되는 두 가지 확인 지점이다.

## 11. 검증 체크리스트와 완료 기준

### 11.1 자동 테스트

| 대상 | 반드시 통과할 사례 |
| --- | --- |
| 로그 | 일반 코스, Practice/Tutorial/Test, SGGameMode 단독, 두 로비 줄, exit, 첫 시작 과거 로그, 잘린 행, 파일 축소/회전 |
| 홀 | 1→2, 9→10, 17→18 fixture, PAR/거리 오인 방지, 여러 숫자 충돌, 1개 표본 미확정, 6초 밖 후보 제외, 5초 stale |
| 비동기 | OCR 진행 중 로비/연습장/게임 종료/다른 창/레이아웃 변경, timeout 뒤 도착한 결과 폐기 |
| 격리 | OCR 7초 지연·무한 대기 모사, 프로세스 질의 실패, helper 없음에도 세션/경고/연장/잠금·정상 종료 경로 회귀 없음 |
| outbox | offline 3회 → online 3회 저장, ACK 응답 유실 후 재전송, 재시작, 손상 마지막 행, 파일쓰기 실패, 타석 변경, 시험 기록 미이관 |
| 서버 | v1 정상, v2 정상, 잘못된 enum/크기/홀/미래시각, 401, 다른 타석 ID, 다른 세션 ID, DB 오류에도 핵심 heartbeat 유지 |
| DB | 동일 이벤트 동시 10회=1행, 같은 round 다른 ID=1행, conflict payload 거절, 오래된 표본이 새 값을 덮지 않음 |
| 집계 | KST 23:59/00:00, 지연 수신, 조회 실패≠0, legacy completed/연습장/강제종료 제외 |
| 권한 | 비로그인·일반 회원·타 매장 모두 이력 조회 거절, 승인 관리자만 조회 |
| UI | PC/이용권/게임 독립 표시, 오래된 번호 자동 제거, 메뉴에서도 최근 복귀 이력 유지, 모달 키보드 닫기·오류/빈 상태 |
| 패키지 | 운영 단일 실행, offline 네트워크/종료 0, secret 없는 ASAR, 설정 미존재/이전/잘못된 값, 시작프로그램 실제 경로 |

테스트 명령은 기존 Agent `check`에 신규 Node 테스트를 포함한다. 서버 단위 테스트 도구는 저장소 기존 도구를 우선 활용한다. 필요 시 도입 근거를 문서화한다.

실행: `npm run typecheck`, 대상 ESLint, `npm --prefix windows-agent run check`, 서버/DB 신규 테스트, `git diff --check`, 마지막 `npm run build`. dev 서버를 켜둔 채 같은 `.next`로 build하지 않는다. DB 테스트 자격증명은 격리 환경인지 확인하고 운영 URL이면 중단한다.

### 11.2 현장 A-02 시험: 사장님과 함께

1. 손님 없는 시간과 장비 조작 범위 승인을 받는다. 설치된 Agent 경로·버전·타석·기존 설정을 먼저 기록한다. 비밀값은 제외한다.
2. 먼저 offline-test를 실행한다. 운영 Agent와 프로필·네트워크를 분리하고, 현장 게임으로 메뉴 → 연습장 → 로비 → 일반 코스 → 1·2·9·10·18번 홀/결과 화면을 가능한 순서로 확인한다. 못 본 홀은 미검증이라고 기록한다.
3. 모니터가 잠기거나 게임이 최소화된 경우 번호를 추정하지 않는지 확인한다. 원격제어를 끊었을 때도 점검한다.
4. 운영 전환 전 기존 Agent를 정상 종료한다. A-02용 자격증명을 시험 PC에 복제하여 두 온라인 Agent를 만들지 않는다.
5. 운영판에서 관리자 화면의 PC 신호, 현재 게임 상태, 홀 관측 시각, 복귀 이력을 확인한다. 테스트 이용/이벤트는 승인된 절차로 표시·정리한다.
6. 일반 코스 한 번 → 로비 두 로그에도 DB 1건. 연습장 한 번 → 0건. 이 동작이 홀 OCR 실패와 무관한지 확인한다.
7. 네트워크 차단 중 서로 다른 일반 코스 이용 2회 이상 → 복구 후 같은 개수만 동기화되는지 확인한다. 현재 예약 건수는 바뀌면 안 된다.
8. PC 재부팅 → 자동실행 → Agent 중복 없음 → 기존 세션/시간 종료 기능도 확인한다. 종료 시험은 손님 없는 타석에서 별도 승인 후 한다.

**완료 판정:** 로컬 감지·서버 저장·대시보드 표시·설치 후 재부팅을 모두 검증해야 `최종 운영판`이라고 부른다. 문서의 11개 테스트 보고나 1→2홀 성공만으로 완료 처리하지 않는다. 현장 오탐·미확인 비율, p95 반영 지연, 테스트한 해상도/홀/화면을 표로 남긴다. 확인된 오탐이 남으면 해당 layout은 운영 활성화하지 않는다.

## 12. 배포와 롤백

| 문제 | 즉시 조치 |
| --- | --- |
| OCR만 불안정 | `gameHoleDetectionEnabled=false`, 로그/PC/이용시간 유지. 홀은 확인 불가 |
| 게임 모니터 전체 문제 | `gameMonitoringEnabled=false`, 기존 시간 제어/heartbeat 유지 |
| 신규 Agent 회귀 | Agent 정상 종료 후 백업한 이전 패키지로 되돌림. 설정/outbox 백업 유지, 토큰이 바뀌었다면 이전 패키지에도 승인된 방식으로 적용 |
| 서버/화면 회귀 | v1/v2 API 수용부는 유지하고 신규 UI/집계 읽기만 비활성화하는 rollback 우선 |
| 불가피한 구서버 복귀 | Agent 미ACK 이벤트 로컬 보존, 서버 미지원 명시. 구서버에 v2를 성공한 것으로 처리하지 않음 |
| DB 신규 기능 문제 | 신규 적재 중단/조회 실패 표시. 운영 이벤트 테이블 DROP/데이터 삭제로 롤백하지 않음 |

배포 전 백업할 항목: 기존 패키지 manifest/hash, 시작프로그램 대상 경로, 비밀값이 들어 있는 사용자 설정의 **접근 제한된 로컬 백업**, 운영 outbox. 이 백업을 공개 ZIP에 동봉하지 않는다.

## 13. 이번 MVP 밖의 항목

- 정상 18홀 완주 인증, 샷 수/점수/플레이어 이름, 매출과 게임 이용 횟수의 결합.
- 게임 중 Agent 재시작 뒤 라운드 ID를 완전 복원하는 기능, 제조사 API/IPC 연결.
- `GameSave.bin` 역공학, 메모리 읽기/주입, 잠금 로그 우회, 게임 프로세스 변경.
- 서버로 화면/동영상 전송, 일반 원격제어 도구 도입, 자동 Agent 업데이트 서비스.
- OCR 근거로 세션 자동 연장/요금 청구/게임 종료를 결정하는 기능.
- 기존 예약/키오스크/HA 동작·카카오 로그인 문제의 재설계.

## 14. 하위 모델에게 전달할 시작 프롬프트

> `docs/agent-dashboard-field-integration-plan-20260917.md`에 따라 A 단계부터 순서대로 구현해라. 먼저 preflight와 SHARED-HANDOFF 전체 읽기, git status, 현재 작업 등록을 수행해라. 저장소 Claude 0.7.0을 기준으로 하고 `C:\VISTA\agent전달문서최종`의 별도 현장 0.7.0을 통째로 덮어쓰지 마라. 현장 성공 범위는 1→2홀/로비 복귀이며 중앙 연동은 미검증이다. 계약·이벤트 멱등 저장·기존 운영 격리·PC/세션/게임 분리 표시를 우선 구현해라. 각 단계의 실제 검증 결과와 미완료를 원장에 남겨라. 페이지와 해당 API는 같은 커밋에 넣어라. 운영 DB 변경·push/배포·실기기 제어·토큰 교체는 사용자 승인 전 실행하지 마라. 실제 비밀값이 든 패키지를 공개하거나 커밋하지 마라. 관리자 권한 기준과 ROI가 확인되지 않으면 임의 값으로 활성화하지 말고 필요한 확인만 요청해라.

## 15. 기술 참고와 검토 한계

- Electron은 `desktopCapturer.getSources()`로 창/화면 소스를 얻으며 실제 썸네일 크기와 대상 창을 확인해야 한다. 이 API 존재가 특정 게임/잠긴 화면의 캡처 성공을 보증하지는 않는다. [Electron desktopCapturer 공식 문서](https://www.electronjs.org/docs/latest/api/desktop-capturer)
- 현장 helper는 Windows의 `Windows.Media.Ocr.OcrEngine`을 사용한다. 설치된 Windows 환경에서 실행 가능 여부와 언어 지원은 실기기로 확인한다. [Microsoft OcrEngine 공식 문서](https://learn.microsoft.com/en-us/uwp/api/windows.media.ocr.ocrengine?view=winrt-26100)
- 이번 산출물의 근거는 현장 문서 및 전달된 소스와 저장소 코드다. 바이너리 실행, 현장 OCR 재시험, 실제 고객/운영 DB 조회·변경, 대시보드 운영 E2E는 수행하지 않았다.
