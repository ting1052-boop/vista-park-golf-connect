# 타석 PC 시간제어 및 연장 정책 설계

VISTA Park Golf Connect의 무인 매장 운영에서 타석 PC는 스크린파크골프 프로그램을 실행합니다. 따라서 고객이 플레이 중일 때 이용 종료 안내와 연장 버튼을 게임 화면 위에 띄우려면 PC방 관리 프로그램처럼 항상 위에 표시되는 Windows Agent가 필요합니다.

## 목표

- 입장 또는 현장 이용 시작 시 타석별 이용시간을 카운트합니다.
- 종료 10분 전 타석 PC 위에 알림을 표시합니다.
- 고객은 알림에서 `연장` 또는 `확인`만 선택합니다.
- 연장은 매장 정책에 따라 자동 수락 또는 관리자 확인으로 처리합니다.
- 다음 예약과 겹치는 연장은 DB 배타 제약을 우회하지 않습니다.
- 연장 내역은 추후 정산과 분쟁 대응을 위해 항상 기록합니다.

## 타석 PC 화면 단계

| 단계 | 조건 | 표시 |
| --- | --- | --- |
| 미니 타이머 | 남은 시간 10분 초과 | 화면 모서리에 남은 시간 작게 표시 |
| 10분 전 경고 | 남은 시간 10분 이하 | 중앙 팝업: `이용 종료 10분 전입니다` + `연장` / `확인` |
| 3분 전 경고 | 남은 시간 3분 이하 | 더 강한 알림음과 종료 임박 안내 |
| 이용 종료 | 남은 시간 0분 | 전체화면 종료 안내. 게임은 강제 종료하지 않고 가림 |
| 시간 초과 | 종료 후 유예시간 경과 | 관리자 대시보드에 미퇴장/시간초과 표시 |

알림은 게임 조작을 최대한 방해하지 않도록 작게 시작하되, 종료 시점에는 전체화면 오버레이로 전환합니다.

## 연장 버튼 동작

타석 PC 팝업 버튼은 두 개만 둡니다.

```text
[연장] [확인]
```

- `연장`: 서버에 연장 요청을 생성합니다.
- `확인`: 팝업을 닫고 기존 종료시간을 유지합니다.

연장 요청은 자동 수락 매장에서도 반드시 `extension_requests`에 기록합니다. 자동 수락은 `status='approved'`, `decision_source='auto'`로 저장합니다.

## 매장별 연장 정책

연장 정책은 가맹점마다 다를 수 있으므로 `store_settings` 테이블로 분리합니다.

| 설정 | 기본값 | 설명 |
| --- | --- | --- |
| `extension_mode` | `auto` | `auto` 또는 `manual` |
| `extension_minutes` | `30` | 기본 연장 시간 |
| `extension_notice_minutes` | `10` | 종료 전 알림 시점 |
| `extension_deadline_minutes` | `3` | 연장 마감 기준. `null`이면 종료 후에도 허용 |
| `extension_buffer_minutes` | `10` | 다음 예약 전 비워둘 최소 여유시간 |
| `extension_price` | `6000` | 연장 요청 시점의 기본 요금 |
| `conflict_policy` | `partial` | `reject`, `partial`, `manual_review` |

시흥점 초기값은 `auto + partial`을 추천합니다. 다음 예약이 가까우면 가능한 시간까지만 자동 단축 연장하여 매출과 고객 경험을 모두 살립니다.

## 다음 예약 충돌 처리

현재 예약 중복 방지를 위해 `reservations_bay_time_excl` 배타 제약이 있습니다. 따라서 다음 예약과 겹치는 연장을 임의로 허용하면 안 됩니다.

관리자 확인 화면의 선택지는 다음과 같습니다.

1. `여유시간까지만 단축 연장`
   - 다음 예약 시작 시간에서 buffer를 뺀 시각까지만 연장합니다.
   - 예: 30분 요청, 다음 예약까지 22분, buffer 10분이면 12분만 승인합니다.
2. `다음 예약을 다른 타석으로 이동 후 전체 연장`
   - 빈 타석이 있을 때 다음 예약을 다른 타석으로 옮기고 전체 30분 연장합니다.
3. `거절`
   - 연장을 거절하고 종료 안내를 유지합니다.

자동 수락 모드에서도 충돌 정책을 따릅니다.

| `conflict_policy` | 동작 |
| --- | --- |
| `reject` | 충돌 시 자동 거절 |
| `partial` | 다음 예약 전 여유시간까지만 자동 단축 승인 |
| `manual_review` | 관리자 대시보드에 확인 요청 |

## 서버 처리 원칙

연장을 승인할 때는 반드시 이 순서로 처리합니다.

1. `extension_requests` 생성
2. `reservations.ends_at`을 먼저 연장 시도
3. DB 배타 제약으로 다음 예약 충돌 확인
4. 성공하면 `access_sessions.ends_at` 연장
5. `kiosk_sessions.extended_minutes` 누적 갱신
6. `extension_requests`에 승인 결과, 승인 분, 요금 스냅샷 기록

`access_sessions.ends_at`만 늘리는 방식은 금지합니다. 예약 가용성 계산과 실제 점유 상태가 어긋날 수 있습니다.

## Windows Agent 방향

타석 PC는 스크린파크골프 프로그램이 전면에 떠 있으므로 단순 웹페이지 전체화면은 부족합니다.

추천 구조:

```text
Electron Agent
  - frameless
  - always-on-top
  - 자동 시작
  - 미니 타이머/팝업/종료 오버레이 표시

Next.js 서버
  - /api/agent/session
  - /api/agent/extension-request
  - /api/agent/heartbeat
```

Electron은 오버레이 창과 Windows 자동 실행만 담당하고, 카운트다운 UI와 버튼 로직은 가능한 한 웹 코드와 공유합니다.

## 통신 방식

Agent는 Supabase에 직접 접속하지 않고 서버 API만 호출합니다.

- `GET /api/agent/session`을 15~30초 간격으로 폴링합니다. 응답에는 서버
  기준 `remainingSeconds`, 세션 상태, 연장 요청 처리 결과, `commands[]`
  (잠금 해제, PC 종료 등 서버발 명령 예약 채널)를 담습니다.
- Agent는 응답 값으로 로컬 카운트다운을 하고 다음 폴링에서 보정합니다.
  **타석 PC의 로컬 시계를 믿지 않습니다** (현장 PC 시계는 틀어집니다).
- 10분 전 경고가 목적이므로 폴링 30초 지연은 문제되지 않습니다. Realtime
  구독은 재연결 처리와 Supabase 키 배포 부담이 있어 Agent에는 쓰지 않고,
  관리자 대시보드 쪽에만 사용합니다.

## Agent 인증

Supabase 키(anon/service)를 현장 PC에 배포하지 않습니다. 타석 단위
고정 토큰을 사용합니다.

```text
agent_devices
- id uuid PK
- store_id, bay_id FK
- token_hash text          -- 관리자가 발급한 타석별 토큰의 해시
- last_seen_at timestamptz -- 폴링마다 갱신
- created_at
```

- Agent는 요청마다 `Authorization: Bearer <토큰>`을 보내고, 서버가
  토큰 → 타석 매핑을 검증합니다.
- `last_seen_at` 덕분에 타석 PC 오프라인 감시가 함께 생깁니다.
  대시보드에 "타석 PC n분째 응답 없음" 알림을 표시할 수 있습니다.

## 시간초과·만료 정리 (크론)

기존 `reservation-prepare` 크론 패턴을 재사용해 1분 주기 정리
엔드포인트를 둡니다.

- `ends_at + 유예(5분)`가 지난 active/extended 세션 → `overdue` 전환,
  관리자 대시보드에 미퇴장 알림
- 승인 전에 세션이 끝난 `extension_requests` → `expired` 처리
- PC 화면은 이미 종료 오버레이 상태이므로 별도 조치 없음

## 사전 실증

본격 개발 전에 시흥점 실제 타석 PC에서 목업 오버레이를 테스트해야 합니다.

확인할 것:

- 스크린파크골프 프로그램 위에 항상 위 창이 보이는지
- 게임이 독점 전체화면인지, borderless/windowed인지
- 팝업이 게임 입력을 방해하지 않는지
- 알림음이 충분히 들리는지
- 종료 오버레이가 화면을 덮을 수 있는지

독점 전체화면에서는 always-on-top 창이 가려질 수 있습니다. 이 경우 게임 설정에서 테두리 없는 창모드로 바꾸거나, 알림음/Windows 알림을 보조 수단으로 사용합니다.

## 구현 순서

1. `store_settings`, `extension_requests`, `agent_devices` DB 마이그레이션 적용
2. 관리자 화면에 매장별 연장 정책 설정 추가
3. 관리자 대시보드에 연장 요청 카드 추가
4. 연장 승인 서버 로직 구현 (reservations 먼저 → 배타 제약 검증 → access_sessions)
5. Agent용 API (`/api/agent/session`, `/api/agent/extension-request`) + 타석 토큰 인증
6. `/bay/display` 웹페이지를 브라우저에서 먼저 개발·테스트
7. Electron 목업 오버레이로 시흥점 타석 PC 실증
8. VISTA Bay Agent 제작
9. overdue/expired 정리 크론
10. Home Assistant/WOL/장비 OFF 순서 제어 연결

## 1차 MVP 범위

- 연장 버튼은 `연장` / `확인`만 둡니다.
- 기본 연장 시간은 30분입니다.
- 자동 수락 모드는 충돌이 없으면 즉시 승인합니다.
- 충돌이 있으면 매장 정책에 따라 거절, 단축 승인, 관리자 확인으로 처리합니다.
- 실제 결제는 2차 기능으로 두고, `extension_requests.price_amount`에 정산용 금액만 기록합니다.
