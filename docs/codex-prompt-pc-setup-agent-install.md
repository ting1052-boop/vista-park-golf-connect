# HH 골프 PC 세팅 도구 v3.5 — VISTA Bay Agent 자동 설치 추가 지시서

이 문서는 그대로 GPT/Codex 에 붙여넣어 쓰는 작업 지시서다.
받는 쪽은 **VISTA 서버 저장소에 접근할 수 없다.** 필요한 규격은 전부 이 문서 안에 있다.
v3.4 지시서(서버 등록 기능)가 이미 구현되어 있다는 전제다.

---

## 0. 역할과 범위

당신은 **HH 골프 PC 세팅 도구** 의 개발자다. 이 도구는 원본 SSD 를 복제해 만든 매장
PC 에서 실행되어 초기 설정을 끝낸다. v3.4 에서 PC 정보를 VISTA 서버에 등록하는
기능(`POST /api/pc-setup/register`)을 넣었다.

**이번에 추가할 것은 하나다.** 등록이 성공하면 그 타석의 **VISTA Bay Agent** 를 설치한다.

Agent 는 타석 PC 에서 상시 실행되며 VISTA 서버에 상태를 보고하고(대시보드 "PC 켜짐"),
관리자의 "PC 정상 종료" 명령을 받는 Windows 프로그램이다(Electron, 단일 exe).

**서버 쪽은 이미 완성되어 있다.** 설치에 필요한 것(실행파일 주소·해시, 설정 파일 내용,
토큰)은 전부 등록 응답에 들어 있다. 새 API 를 설계하지 말고 아래 규격대로만 하라.
서버를 고쳐야 한다고 판단되면 구현을 멈추고 이유를 보고하라.

---

## 1. 절대 하지 말 것

- **등록 응답의 `agent` 내용(특히 `agentToken`)을 로그·화면·파일(아래 설정 파일 외)에
  남기지 말 것.** 로그에는 "Agent 설치 정보 수신" 같은 사실만.
- **서버가 준 설정 파일 내용을 해석하거나 고치지 말 것.** 받은 그대로 쓴다.
- **SHA-256 대조를 건너뛰지 말 것.** 다르면 설치하지 않는다.
- **`installAgent: true` 를 오프라인 대기열(재시도 큐)에 넣지 말 것.** (4절 참고)
- **원본 PC(복제 이미지의 원본)에 `C:\ProgramData\VISTA\agent` 를 남긴 채 이미지를 뜨지
  말 것.** 그 폴더에는 한 타석의 토큰이 들어 있어, 복제된 PC 전부가 같은 타석으로 보고한다.
- Agent 설정을 `%APPDATA%`(사용자 폴더)에 쓰지 말 것. 반드시 `configDir`(PC 공용 폴더).

---

## 2. 등록 요청 변경

기존 `POST /api/pc-setup/register` 본문에 필드 하나만 추가한다.

```json
{
  "...기존 필드 그대로...": "",
  "installAgent": true
}
```

- 값이 **정확히 `true`(boolean)** 일 때만 동작한다. 문자열 `"true"` 는 무시된다.
- 이 요청은 그 타석의 Agent 토큰을 **새로 발급**한다. 같은 타석에 전에 깔린 Agent 는
  그 순간 토큰이 무효가 된다. 그래서 **바로 이어서 설치할 때만** 보낸다.
- 등록 창구(토큰 없음) 또는 전역 토큰으로 등록할 때만 발급된다. `deviceToken` 으로 하는
  갱신 요청에는 `installAgent` 를 넣지 않는다(재설치할 때만 예외, 5절).

---

## 3. 등록 응답에 추가된 필드

```json
{
  "ok": true,
  "action": "created",
  "...기존 필드...": "",
  "agent": {
    "release": {
      "version": "0.9.6",
      "url": "https://github.com/ting1052-boop/vista-park-golf-connect/releases/download/agent-v0.9.6/VISTA-Bay-Agent.exe",
      "sha256": "AA5E2866AEB6E3C86B1C24542DDE3EA0355C1FC2E83273B05B5E702A3E7D5DCB"
    },
    "installDir": "C:\\VISTA",
    "configDir": "C:\\ProgramData\\VISTA\\agent",
    "files": {
      "bays.config.local.json": {
        "bays": [
          {
            "bayCode": "VISTA-XII:A-01",
            "label": "송도파크자이 · 골프 1번",
            "agentId": "vista-xii-a-01",
            "agentToken": "(비밀)",
            "monitorOnly": true,
            "gameMonitoringEnabled": false,
            "gameLogDiagnosticsEnabled": false
          }
        ]
      },
      "agent.config.json": { "bayCode": "VISTA-XII:A-01" }
    }
  },
  "agentError": null
}
```

- `agent` 가 `null` 이고 `agentError` 가 있으면 Agent 설치만 실패한 것이다.
  **PC 등록 자체는 성공**이다. 화면에 "PC 등록 완료, Agent 설치 실패: `<message>`" 로 표시.
- 위 값들(버전·주소·해시·폴더)은 **예시**다. 코드에 박지 말고 매번 응답 값을 쓴다.
  서버가 새 버전을 알려주면 도구 수정 없이 새 버전이 깔린다.
- `files` 안의 항목 개수·필드는 서버가 정한다. 항목이 늘어나도 같은 규칙(이름=파일명,
  값=내용)으로 쓴다.

| `agentError.code` | 뜻 | 도구 동작 |
|---|---|---|
| `agent_requires_setup_tool` | 발급 조건이 아닌 등록(관리자 수동 입력 등) | 설치 건너뜀, 메시지 표시 |
| `agent_profile_unavailable` | 서버가 매장 설정을 못 읽음 | 설치 건너뜀, "서버 관리자에게 문의" |
| `agent_issue_failed` | 서버가 토큰 저장 실패 | 설치 건너뜀, 잠시 후 도구 재실행 안내 |

---

## 4. 설치 순서 (등록 성공 직후, 같은 실행 안에서)

도구는 관리자 권한으로 실행 중이라고 가정한다.

### 4-1. 실행파일 받기 + 검증

1. `release.url` 을 HTTPS 로 임시 파일에 받는다(예: `%TEMP%\VISTA-Bay-Agent.download`).
2. 받은 파일의 SHA-256 을 계산해 `release.sha256` 과 **대소문자 무시하고** 비교한다.
3. 다르면 임시 파일을 지우고 **설치 중단**. "Agent 파일 검증 실패" 표시.

### 4-2. 기존 Agent 정리

1. 실행 중인 Agent 종료: 프로세스 이름 `VISTA-Bay-Agent`, `VISTA Bay Agent`.
   먼저 정상 종료를 시도하고 10초 안에 안 끝나면 강제 종료.
2. **모든 사용자**의 시작프로그램 폴더에서 `VISTA Windows Agent.lnk` 를 지운다.
   경로: `C:\Users\<각 사용자>\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\`
   (예전 USB 설치 방식이 사용자별로 만든 바로가기다. 남겨두면 옛 exe 가 먼저 떠서
   방금 무효가 된 옛 토큰으로 접속을 시도한다.)

### 4-3. 실행파일 설치

1. `installDir`(`C:\VISTA`) 폴더를 만든다.
2. 기존 `C:\VISTA\VISTA-Bay-Agent.exe` 가 있으면 `VISTA-Bay-Agent.exe.backup-yyyyMMdd-HHmmss`
   로 이름을 바꾼다.
3. 검증된 임시 파일을 `C:\VISTA\VISTA-Bay-Agent.exe` 로 옮긴다.

### 4-4. 설정 파일 쓰기

`configDir`(`C:\ProgramData\VISTA\agent`) 를 만들고, `files` 의 각 항목을 파일로 쓴다.
파일 이름은 키, 내용은 값을 JSON 으로 직렬화한 것.

- **인코딩: UTF-8, BOM 없이.** (Agent 0.9.6 은 BOM 이 있어도 읽지만, 없게 쓴다.)
  PowerShell 이면 `[IO.File]::WriteAllText(path, json, (New-Object Text.UTF8Encoding($false)))`.
  `Set-Content -Encoding UTF8` 은 BOM 을 붙이므로 쓰지 않는다.
- **PowerShell `ConvertTo-Json` 은 `-Depth 10` 을 반드시 준다.** 기본 깊이(2)면 `bays`
  안의 객체가 문자열로 뭉개진다.
- 쓰기는 `파일.tmp` 에 쓴 뒤 이름 바꾸기로 한다(반쯤 쓰인 파일 방지).

**쓴 다음 반드시 검증한다.** 두 파일을 다시 읽어 파싱하고:

- `bays.config.local.json` 의 `bays` 가 **배열**이고 원소가 1개 이상
- `agent.config.json` 의 `bayCode` 가 `bays` 원소 중 하나의 `bayCode` 와 같음

하나라도 틀리면 설치 실패로 처리한다. (`bays` 가 배열이 아니면 Agent 는 설정을 무시하고
타석 선택 화면을 띄운다. PowerShell 이 원소 1개짜리 배열을 풀어버리는 사고가 흔하다.)

### 4-5. 자동 실행 등록

**모든 사용자 공용** 시작프로그램 폴더에 바로가기를 만든다.

- 폴더: `[Environment]::GetFolderPath("CommonStartup")`
  (보통 `C:\ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp`)
- 이름: `VISTA Windows Agent.lnk`
- 대상: `C:\VISTA\VISTA-Bay-Agent.exe`, 작업 폴더: `C:\VISTA`, 창: 최소화(7)

작업 스케줄러·Windows 서비스로 등록하지 말 것. Agent 는 로그인한 사용자 화면에서 돌아야
한다(일반 매장에서는 손님 화면에 남은시간 안내를 띄운다).

### 4-6. 실행

- 도구가 PC 이름을 바꿔 **재부팅할 예정이면** 여기서 실행하지 않는다. 재부팅 후 로그인하면
  4-5 의 바로가기로 자동 실행된다.
- 재부팅 없이 끝나면 **관리자 권한이 아닌 상태로** 실행한다:
  `explorer.exe "C:\VISTA\VISTA-Bay-Agent.exe"` (탐색기를 거치면 일반 권한으로 뜬다).
  10초 뒤 프로세스가 살아 있는지만 확인한다.

### 4-7. 완료 표시

```
Agent 설치 완료 (v<release.version>)
재부팅/로그인 후 2분 안에 관리자 대시보드에서 이 타석이 "PC 켜짐"이 되는지 확인하세요.
```

서버 연결 여부는 도구가 확인하지 않는다. 대시보드로 확인한다.

---

## 5. 재설치·재시도

- Agent 만 다시 깔고 싶으면 도구를 다시 실행해 `installAgent: true` 로 등록하면 된다.
  토큰이 새로 발급되고 설정 파일이 덮어써진다. 4절을 처음부터 다시 수행.
- 오프라인이라 등록이 대기열로 갔으면 **Agent 는 설치하지 않는다.** "인터넷 연결 후 도구를
  다시 실행해 Agent 를 설치하세요" 로 표시. 대기열에서 나중에 보내는 요청에는
  `installAgent` 를 넣지 않는다(파일을 쓸 사람이 없는데 토큰만 바뀌면 그 타석 Agent 가 끊긴다).

---

## 6. 원본 이미지 만들 때 (현장 담당자 안내에 포함)

원본 PC 에서 도구를 돌렸다면, 이미지를 뜨기 전에 **반드시** 지운다:

```
C:\ProgramData\VISTA\agent\          (폴더째)
C:\Users\*\AppData\Roaming\vista-windows-agent\bays.config.local.json
C:\Users\*\AppData\Roaming\vista-windows-agent\agent.config.json
```

`C:\VISTA\VISTA-Bay-Agent.exe` 와 시작프로그램 바로가기는 남아 있어도 된다(토큰이 없으면
Agent 는 서버에 접속하지 않는다). 복제된 PC 에서 도구가 설치할 때 새 파일로 바뀐다.

---

## 7. 완료 기준

- [ ] `installAgent: true` 가 **대화형 실행에서만** 전송된다. 대기열 재전송에는 없다
- [ ] 응답의 `agent` 내용이 로그·화면에 평문으로 나오지 않는다
- [ ] 해시가 다르면 설치하지 않는다 (일부러 틀린 해시로 시험)
- [ ] `C:\VISTA\VISTA-Bay-Agent.exe` 버전이 `release.version` 과 같다(파일 속성 → 자세히)
- [ ] `C:\ProgramData\VISTA\agent\` 에 두 파일이 BOM 없이 있고, 4-4 검증을 통과한다
- [ ] 공용 시작프로그램에 바로가기가 있고, 사용자별 옛 바로가기는 없다
- [ ] **평소 쓰는 계정(관리자 아님)으로 로그인**했을 때 Agent 가 뜬다
- [ ] 대시보드에서 그 타석이 2분 안에 "PC 켜짐"
- [ ] 관리자 계정으로 설치하고 일반 계정으로 로그인해도 위가 된다
- [ ] 도구를 한 번 더 실행해도(재설치) 정상 동작한다
- [ ] `agentError` 가 오면 등록은 성공으로, Agent 만 실패로 표시한다

---

## 8. 참고: 이 설계의 이유

- **토큰을 이미지에 넣지 않는 이유**: 복제 PC 가 전부 같은 토큰을 쓰게 된다. PC 마다
  설치 시점에 서버가 새로 발급한다.
- **PC 공용 폴더(`ProgramData`)를 쓰는 이유**: 도구는 관리자 권한으로 돌고, 손님이 쓰는
  계정은 다를 수 있다. 사용자 폴더에 쓰면 계정이 어긋나 Agent 가 토큰을 못 읽는다.
  Agent 0.9.6 부터 이 폴더를 읽고, 사용자 폴더보다 우선한다.
- **설정 내용을 서버가 만드는 이유**: 매장마다 Agent 동작이 다르다(아파트 매장은 손님
  화면을 띄우지 않음). 그 판단을 서버가 하면 도구와 Agent 를 고치지 않고 매장을 늘릴 수 있다.
