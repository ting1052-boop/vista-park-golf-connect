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

기본 빌드는 Windows 권한 문제를 피하기 위해 `dist\win-unpacked` 실행 폴더를
만듭니다. 이 폴더 전체를 ZIP으로 묶어 배포하며, 안의 `VISTA Bay Agent.exe`만
따로 꺼내면 실행되지 않습니다. 단일 EXE가 꼭 필요할 때만 관리자 권한과 서명
도구 환경을 준비한 뒤 `npm run dist:portable`을 사용합니다.

결과물: `windows-agent\dist\win-unpacked\` 폴더 전체

공개 기본값은 `bays.config.json`, 실제 Agent 토큰은 Git에서 제외된
`bays.config.local.json`에 둡니다. Agent 0.6.0부터 두 파일을 병합해서 읽습니다.
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
%APPDATA%\vista-windows-agent\logs\game-monitor-diagnostics.log
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
   - 설정/로그 폴더: `%APPDATA%\vista-windows-agent`

### 아파트 매장 (`monitorOnly`)

송도파크자이처럼 **요금·이용시간이 없는 아파트 커뮤니티 시설**은 타석 설정에
`"monitorOnly": true` 를 넣습니다. 별도 exe 가 아니라 같은 exe 이고, 설치 방법도
위와 같습니다. 타석 목록에서 `송도 · 골프 1번` 처럼 매장 이름이 붙은 항목을 고르면
됩니다.

| | 일반 매장 (시흥) | `monitorOnly` (송도) |
| --- | --- | --- |
| 남은시간 경고창 | 표시 | **표시 안 함** |
| 종료 후 잠금화면 | 표시 | **표시 안 함** |
| 이용 종료 후 자동 PC 종료 | 5분 뒤 | **하지 않음** |
| 대시보드 heartbeat·게임상태 | 보냄 | 보냄 |
| 관리자 `PC 정상 종료` 명령 | 받음 | 받음 |

`monitorOnly` 는 `autoShutdownAfterEndMinutes` 를 강제로 0 으로 만듭니다. 값을
따로 적어둘 필요가 없고, 적어두더라도 무시합니다.

화면에 아무것도 뜨지 않으므로 살아 있는지는 **대시보드/무인제어의 `PC 켜짐`**
으로 확인합니다. 트레이 아이콘은 두지 않았습니다. Agent 가 죽으면 아이콘도 같이
사라져서 확인 수단이 되지 못하고, 대시보드가 이미 같은 일을 하기 때문입니다.

## 로컬 테스트가 필요할 때

서버 연결 없이 오버레이만 확인하려면 `bays.config.json`의 `sessionSource`를
임시로 `local`로 바꾸고, 세션 파일을 직접 넣어 오버레이 동작을 확인합니다.
설정 폴더(`%APPDATA%\vista-windows-agent`)에 `agent-session.json`을 만들고
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

타석 PC는 매장 오픈 때 전원이 켜지므로, Agent도 부팅과 함께 자동 실행되어야
한다. 등록하지 않으면 PC는 켜져 있는데 Agent만 꺼져 있어 남은 시간 표시와
게임 상태 감지가 모두 동작하지 않는다.

`VISTA-Bay-Agent.exe` 와 `install-startup.ps1` 을 같은 폴더에 두고 PowerShell
에서 실행한다.

```powershell
powershell -ExecutionPolicy Bypass -File .\install-startup.ps1
```

스크립트가 없으면 수동으로도 된다. `Win+R` 에 `shell:startup` 을 입력해 열린
폴더에 `VISTA-Bay-Agent.exe` 의 바로가기를 넣으면 같은 효과다.

등록 후 확인: PC를 재부팅하고 몇 분 뒤 관리자 대시보드에서 해당 타석이
`PC 켜짐` 으로 바뀌는지 본다.

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

## 0.8.0 게임 상태 감지 및 설치 설정

0.8.0은 기존 시간 제어와 별도로 골프 프로그램의 메뉴·일반 코스·연습장을
관찰합니다. 보정이 끝난 타석에서는 게임 창의 홀 표시 영역만 로컬 OCR로 읽어
관리자 대시보드에 `최근 홀 관측`으로 보냅니다. 화면 원본과 OCR 원문은 서버로
보내지 않으며, OCR 실패는 예약·경고·연장·종료 기능을 막지 않습니다.

공통 배포 ZIP에는 실제 Agent 토큰을 넣지 않습니다. 각 타석 PC의 아래 사용자
폴더에 `bays.config.local.json`을 만들고 해당 타석 토큰만 넣습니다.

```text
%APPDATA%\vista-windows-agent\bays.config.local.json
```

형식은 `bays.config.local.example.json`을 참고합니다. 이 파일은 Git·공개 드라이브·
화면 캡처에 포함하지 않습니다. 기존 실행파일 안에 토큰이 포함돼 있던 PC는 새
실행파일 교체 전에 기존 설정을 안전한 로컬 파일로 옮겨야 합니다.

홀 감지는 기본적으로 꺼져 있습니다. A-02 현장에서 실제 게임 창과 홀 영역을
확인한 뒤 같은 폴더에 `monitor.config.json`을 만들고, 검증된 ROI와 고유
`gameHoleLayoutVersion`을 기록한 경우에만 켭니다. 예시 ROI 숫자를 운영에 그대로
사용하면 안 됩니다. 실제 게임 창 이름은 `NewGameViewportClientWindow`로 확인됐지만,
창이 없거나 둘 이상이면 번호를 추측하지 않고 `확인 불가`로 둡니다.

대시보드의 `오늘 로비 복귀`는 일반 코스에서 메뉴로 돌아온 횟수입니다. 18홀 완주,
예약, 결제 건수를 의미하지 않습니다. 전송되지 않은 기록은 로컬 outbox에 남고
서버의 확인 응답을 받은 뒤에만 제거됩니다.
