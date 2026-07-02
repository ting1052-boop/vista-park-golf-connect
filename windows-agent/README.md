# VISTA Windows Agent

VISTA Park Golf Connect의 타석 PC에 설치하는 작은 Windows용 에이전트 초안입니다.

이 에이전트는 1차 MVP에서 다음 역할을 합니다.

- 타석 PC가 켜져 있는지 관리자 서버에 주기적으로 알림
- 현재 이용 세션의 남은 시간을 계산
- 종료 10분 전 안내 화면 표시
- 이용시간 종료 시 차단 안내 화면 표시
- 게임 프로그램 실행 여부를 `tasklist`로 확인

현재 버전은 실제 Windows 잠금 프로그램이 아니라 Edge 전체화면 안내 화면을 띄우는 방식입니다. Alt+F4, 작업 관리자까지 완전히 막는 강한 잠금은 추후 .NET 또는 Electron 기반 네이티브 에이전트로 확장하는 것이 좋습니다.

## 파일 구성

- `vista-agent.js`: 에이전트 본체
- `agent.config.example.json`: 타석별 설정 예시
- `agent-session.example.json`: 테스트용 이용 세션 예시
- `screens/warning.html`: 종료 10분 전 안내 화면
- `screens/lock.html`: 이용 종료 안내 화면
- `start-agent.cmd`: 더블클릭 실행 파일
- `install-startup.ps1`: Windows 시작프로그램 등록 스크립트

## 1. PC별 설정 만들기

`windows-agent` 폴더에서 아래 두 파일을 복사합니다.

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
  "heartbeatIntervalSeconds": 15,
  "warningBeforeMinutes": 10,
  "gameProcessNames": ["ParkGolf.exe"],
  "openWarningScreen": true,
  "openLockScreen": true,
  "sessionFile": "agent-session.json"
}
```

`agentSecret`는 나중에 VISTA 서버의 `AGENT_SECRET` 환경변수와 같은 값으로 맞춥니다.

## 2. 로컬 테스트

`agent-session.json`의 `endsAt`을 현재 시간 기준 10분 이내로 바꾸면 경고 화면이 뜹니다. 예를 들어 15:00에 테스트한다면 `endsAt`을 `2026-07-02T15:08:00+09:00`처럼 설정합니다.

실행:

```powershell
node .\vista-agent.js
```

또는 `start-agent.cmd`를 더블클릭합니다.

## 3. 시작프로그램 등록

타석 PC 부팅 시 자동 실행하려면 PowerShell에서 실행합니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\install-startup.ps1
```

## 4. 서버 연동 예정 API

아직 Next.js 서버 API는 클로드 작업과 충돌하지 않도록 만들지 않았습니다. 다음 단계에서 아래 API를 추가하면 됩니다.

- `POST /api/agent/heartbeat`
  - 에이전트가 15초마다 상태 전송
  - 관리자 대시보드에서 PC 온라인/오프라인, 남은 시간, 게임 실행 여부 표시

예상 payload:

```json
{
  "agentId": "vista-siheung-bay-01",
  "storeId": "11111111-1111-4111-8111-111111111111",
  "bayId": "aaaaaaaa-0001-4000-8000-000000000001",
  "bayCode": "A-01",
  "pcName": "VISTA-BAY-01",
  "agentVersion": "0.1.0",
  "status": "playing",
  "accessSessionId": "test-session-001",
  "remainingSeconds": 540,
  "gameAppRunning": true,
  "screenLocked": false,
  "lastSeenAt": "2026-07-02T06:00:00.000Z"
}
```

## 운영 메모

1. PC 전원 ON은 WOL 또는 스마트플러그로 처리합니다.
2. Windows 자동 로그인과 시작프로그램 실행을 설정하면 PC 부팅 후 에이전트가 자동 실행됩니다.
3. 게임 프로그램은 기존처럼 Windows 시작프로그램에 등록해 자동 실행합니다.
4. 이용시간 차단은 먼저 화면 안내 방식으로 시작하고, 현장에서 충분히 테스트한 뒤 강한 잠금으로 확장합니다.
