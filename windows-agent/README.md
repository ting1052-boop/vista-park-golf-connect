# VISTA Bay Agent

VISTA Park Golf Connect의 각 타석 PC에 설치하는 Windows용 시간제어 Agent입니다.

이 Agent는 스크린파크골프 프로그램이 실행된 상태에서도 PC방 관리 프로그램처럼 화면 위에 다음 안내를 표시하기 위한 초안입니다.

- 남은 시간 미니 타이머
- 종료 10분 전 알림
- `연장` / `확인` 버튼
- 이용 종료 후 전체화면 종료 안내
- 서버 연동 전 로컬 세션 파일로 실기기 오버레이 테스트

## 현재 구현 수준

이번 버전은 **Electron 기반 항상-위 오버레이 MVP**입니다.

- `mini`: 화면 오른쪽 위 작은 타이머. 마우스 클릭을 방해하지 않음
- `warning`: 종료 10분 전 중앙 팝업. `연장`, `확인` 버튼 제공
- `lock`: 이용 종료 후 전체화면 안내
- `local` 모드: `agent-session.json`을 읽어 테스트
- `server` 모드: 나중에 `/api/agent/session`, `/api/agent/extension-request`가 완성되면 서버 기준으로 동작

주의: 게임 프로그램이 독점 전체화면(exclusive fullscreen)이면 오버레이가 가려질 수 있습니다. 시흥점 실제 타석 PC에서 먼저 테스트하고, 필요하면 게임을 창모드 또는 테두리 없는 창모드로 바꿔야 합니다.

## 파일 구성

- `electron-main.js`: Electron 메인 프로세스, 세션 폴링, 창 모드 전환
- `electron-preload.js`: 안전한 IPC 브릿지
- `renderer/`: 오버레이 UI
- `agent.config.example.json`: 타석별 설정 예시
- `agent-session.example.json`: 로컬 테스트용 이용 세션
- `start-overlay.cmd`: Electron Agent 실행
- `install-startup.ps1`: Windows 시작프로그램 등록
- `vista-agent.js`: 기존 Node 초안. 참고용으로 보존

## 1. 타석 PC 준비

타석 PC에는 Node.js가 필요합니다.

- 권장: Node.js 20 LTS 이상
- 설치 후 명령 프롬프트에서 확인:

```cmd
node -v
npm -v
```

## 2. PC별 설정 만들기

`windows-agent` 폴더에서 아래 파일을 복사합니다.

```powershell
Copy-Item .\agent.config.example.json .\agent.config.json
Copy-Item .\agent-session.example.json .\agent-session.json
```

`agent.config.json`에서 타석별 값을 수정합니다.

```json
{
  "agentId": "vista-siheung-bay-01",
  "storeId": "11111111-1111-4111-8111-111111111111",
  "bayId": "aaaaaaaa-0001-4000-8000-000000000001",
  "bayCode": "A-01",
  "pcName": "VISTA-BAY-01",
  "apiBaseUrl": "https://vista-park-golf-connect.vercel.app",
  "agentSecret": "change-me",
  "agentToken": "change-me-later",
  "sessionSource": "local",
  "pollIntervalSeconds": 3,
  "warningBeforeMinutes": 10,
  "criticalBeforeMinutes": 3,
  "extensionMinutes": 30,
  "extensionPrice": 6000,
  "gameProcessNames": ["ParkGolf.exe"],
  "sessionFile": "agent-session.json",
  "allowCloseWithEsc": true
}
```

초기 실증은 `sessionSource: "local"`로 둡니다. 서버 API가 완성되면 `server`로 바꿉니다.

## 3. 로컬 테스트

`agent-session.json`의 `endsAt`을 현재 시간 기준 10분 이내로 바꿉니다.

예:

```json
{
  "accessSessionId": "test-session-001",
  "customerLabel": "현장 고객",
  "status": "active",
  "startsAt": "2026-07-02T14:00:00+09:00",
  "endsAt": "2026-07-02T15:10:00+09:00"
}
```

실행:

```cmd
start-overlay.cmd
```

처음 실행하면 `npm install`로 Electron을 설치합니다.

## 4. 테스트해야 할 것

시흥점 실제 타석 PC에서 아래를 확인합니다.

1. 스크린파크골프 프로그램 위에 미니 타이머가 보이는지
2. 종료 10분 전 알림 팝업이 게임 위에 뜨는지
3. `확인` 버튼을 누르면 팝업이 닫히는지
4. `연장` 버튼을 누르면 테스트 메시지가 뜨는지
5. 이용 종료 시간이 지나면 전체화면 종료 안내가 뜨는지
6. 게임 입력을 과하게 방해하지 않는지

## 5. 시작프로그램 등록

PowerShell을 열고 실행합니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\install-startup.ps1
```

이후 Windows 부팅 시 Agent가 자동 실행됩니다.

## 6. 서버 연동 예정

다음 단계에서 VISTA 서버에 아래 API를 추가합니다.

- `GET /api/agent/session`
- `POST /api/agent/extension-request`
- `POST /api/agent/heartbeat`

서버 연동 후에는 각 타석 Agent가 서버의 `access_sessions` 기준으로 남은 시간을 표시하고, `extension_requests`로 연장 요청을 기록합니다.

## 운영 원칙

- PC 전원 ON은 WOL 또는 스마트플러그로 처리합니다.
- PC OFF는 강제 전원 차단보다 Agent를 통한 정상 종료/잠금을 우선합니다.
- 이용 종료 직후에는 PC를 끄기보다 화면을 잠그고 다음 예약에 대비하는 흐름이 안전합니다.
