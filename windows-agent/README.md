# VISTA Bay Agent

VISTA Park Golf Connect의 각 타석 PC에 설치하는 Windows용 시간제어 Agent입니다.

이 Agent는 스크린파크골프 프로그램이 실행된 상태에서도 PC방 관리 프로그램처럼 화면 위에 다음 안내를 표시합니다.

- 남은 시간 미니 타이머
- 종료 10분 전 알림
- `연장` / `확인` 버튼
- 이용 종료 후 전체화면 종료 안내
- VISTA 서버 세션 연동

## 현재 구현 수준

이번 버전은 **Electron 기반 항상-위 오버레이 MVP**입니다.

- `mini`: 화면 오른쪽 위 작은 타이머. 마우스 클릭을 방해하지 않음
- `warning`: 종료 10분 전 중앙 팝업. `연장`, `확인` 버튼 제공
- `lock`: 이용 종료 후 전체화면 안내
- `server` 모드: `/api/agent/session`, `/api/agent/extension-request`, `/api/agent/heartbeat` 기준으로 동작
- 선택 기능: 검증된 게임 실행파일의 실행 여부를 관리자 대시보드로 전송

게임 상태 감지는 예약·이용시간·종료·장비 자동화와 분리된 관찰 기능입니다.
감지 실패 시 `확인 불가`로만 표시되며 이용 흐름에는 영향을 주지 않습니다.

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

## 실행파일(.exe) 배포 — 각 PC에서 JSON 편집 불필요

각 타석 PC에 Node.js를 설치하거나 JSON을 손으로 고칠 필요가 없습니다.
빌드된 `VISTA-Bay-Agent.exe` 하나를 복사하고, **처음 실행할 때 화면에서
타석 번호만 한 번 고르면** 됩니다. 그 선택은 PC에 저장되어 다음부터
자동으로 적용됩니다.

### 빌드 (개발 PC에서 한 번)

```powershell
cd windows-agent
npm install
npm run dist
```

결과물: `windows-agent\dist\VISTA-Bay-Agent.exe`

빌드 전에 매장 공통값을 확인할 파일은 **`bays.config.json` 하나뿐**입니다.
- `shared`: 서버 주소, 시크릿/토큰, 정책(경고 시점·연장 시간·요금), 게임
  프로세스명 등 모든 타석 공통값
- `bays`: 타석 목록(1/2/3번)과 각 타석용 `agentToken`

시흥점 설정 예시:

- 1번 타석 `agentToken`: `REPLACE_WITH_BAY_01_AGENT_TOKEN`
- 2번 타석 `agentToken`: `REPLACE_WITH_BAY_02_AGENT_TOKEN`
- 3번 타석 `agentToken`: `REPLACE_WITH_BAY_03_AGENT_TOKEN`

실제 운영 토큰은 GitHub에 커밋하지 말고, 빌드 전 로컬에서만 넣습니다.

### ScreenGolf 게임 상태 감지

시흥점에서 확인한 실제 실행파일 `ScreenGolf.exe`와 실시간 로그
`C:\PARK_260713-VISTA\ScreenGolf\Saved\Logs\ScreenGolf.log`를 사용합니다.
Agent는 게임 실행 여부와 다음 상태를 서로 분리해서 관찰합니다.

- 프로세스 없음: `골프 프로그램 미실행`
- 프로세스 실행 + 로비 로그: `메뉴·대기 화면`
- 코스 진입 또는 게임 모드 로그: `라운드 진행 · 홀 확인 불가`
- 라운드에서 로비로 돌아옴: 완료와 중도 종료를 구분할 근거가 없으므로 종료를 단정하지 않음

이용 세션의 `playing` 상태는 계속 VISTA 이용시간을 뜻하며 실제 게임 상태와
섞지 않습니다. Agent 0.6.0부터 공개 기본 설정과 비밀 로컬 설정을 병합하므로,
로컬 설정에 새 감지 항목이 없어도 새 기본값이 사라지지 않습니다.

### 홀 번호·라운드 종료 로그 진단

시흥점 기본 설정은 `ScreenGolf\Saved\Logs`와
`ScreenGolf\Binaries\Win64\Logs` 폴더를 10초마다 관찰합니다. Agent를 켜기
전에 존재하던 진단 내용은 무시하고, 그 뒤 새로 추가된 텍스트만 최대 32KB
읽습니다. 원문, 파일명, 전체 경로, 화면 이미지는 저장하거나 서버로 보내지
않습니다.

로컬 진단 결과:

```text
%APPDATA%\VISTA Bay Agent\logs\game-monitor-diagnostics.log
```

기록되는 후보 신호는 다음뿐입니다.

- `hole_candidate`: `Hole 3`, `3번 홀`처럼 라벨이 붙은 숫자
- `round_start_candidate`: 라운드 시작 문구 후보
- `round_end_candidate`: 라운드 종료·완료 문구 후보
- `menu_candidate`: 메뉴·대기 문구 후보
- `text_unreadable`: 바이너리이거나 현재 방식으로 읽을 수 없음

`main_*.log`는 게임 중 잠겨 있어 실시간 홀 표시에는 사용하지 않습니다. 게임이
끝난 뒤 열리면 홀·종료 후보를 진단 파일에만 기록합니다. 이 결과는 조사 자료이며
대시보드의 현재 홀이나 라운드 완료 상태를 자동으로 바꾸지 않습니다. 진단을
끄려면 로컬 설정의 `gameLogDiagnosticsEnabled`를 `false`로 변경합니다.

### 각 타석 PC에서

1. `VISTA-Bay-Agent.exe`를 PC로 복사
2. 더블클릭 실행
3. **"이 PC는 몇 번 타석인가요?"** 화면에서 해당 타석 버튼 클릭 → 끝
4. 잘못 골랐으면: 아래 설정 폴더의 `agent.config.json`을 지우고 다시 실행
   - 설정/로그 폴더: `%APPDATA%\VISTA Bay Agent`

## 로컬 테스트가 필요할 때

서버 연결 없이 오버레이만 확인하려면 `bays.config.json`의 `sessionSource`를
임시로 `local`로 바꾸고, 세션 파일을 직접 넣어 오버레이 동작을 확인합니다.
설정 폴더(`%APPDATA%\VISTA Bay Agent`)에 `agent-session.json`을 만들고
`endsAt`을 현재 시간 기준 몇 분 이내로 바꿉니다. (개발 중 소스로 실행할
때는 `windows-agent` 폴더의 `agent-session.json`도 인식합니다.)

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
4. `연장` 버튼을 누르면 서버에 연장 요청이 접수되는지
5. 이용 종료 시간이 지나면 전체화면 종료 안내가 뜨는지
6. 게임 입력을 과하게 방해하지 않는지

## 5. 시작프로그램 등록

PowerShell을 열고 실행합니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\install-startup.ps1
```

이후 Windows 부팅 시 Agent가 자동 실행됩니다.

## 6. 서버 연동

VISTA 서버에는 아래 Agent API가 준비되어 있습니다.

- `GET /api/agent/session`
- `POST /api/agent/extension-request`
- `POST /api/agent/heartbeat`

각 타석 Agent는 서버의 `access_sessions` 기준으로 남은 시간을 표시하고, `extension_requests`로 연장 요청을 기록합니다.

현재 빌드 설정은 이미 서버 모드입니다. 현장 PC에서는 exe를 실행하고 타석 번호만 선택하면 됩니다.
Agent API는 각 타석별 `agentToken`으로 인증하므로, 타석 PC에는 Supabase 키나 서비스 롤 키를 넣지 않습니다.

## 운영 원칙

- PC 전원 ON은 WOL 또는 스마트플러그로 처리합니다.
- PC OFF는 강제 전원 차단보다 Agent를 통한 정상 종료/잠금을 우선합니다.
- 이용 종료 직후에는 PC를 끄기보다 화면을 잠그고 다음 예약에 대비하는 흐름이 안전합니다.
