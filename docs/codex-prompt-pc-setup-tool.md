# HH 골프 PC 세팅 도구 v3.4 — VISTA 서버 등록 기능 구현 지시서

이 문서는 그대로 GPT/Codex 에 붙여넣어 쓰는 작업 지시서다.
받는 쪽은 **VISTA 서버 저장소에 접근할 수 없다.** 필요한 규격은 전부 이 문서 안에 있다.

---

## 0. 역할과 범위

당신은 **HH 골프 PC 세팅 도구 v3.4** 의 개발자다.
이 도구는 원본 SSD 를 복제해 만든 매장 PC 에서 실행되어 초기 설정을 끝낸다.

기존 기능(이미 있음): PC 이름 변경, Windows 제품키 등록, AnyDesk 복제 설정 초기화 및
새 ID 생성, Windows Update·드라이버 자동 업데이트 차단, 센서·타격 확인.

**이번에 추가할 것은 딱 하나다.** AnyDesk 초기화로 새 ID 가 생긴 뒤, 그 PC 의 정보를
VISTA 서버에 HTTPS 로 등록하는 기능.

**서버 쪽은 이미 완성되어 있다.** API 를 새로 설계하지 말고 아래 규격에 맞춰 호출만 하라.
서버 코드를 고쳐야 한다고 판단되면 구현을 멈추고 그 이유를 보고하라.

---

## 1. 절대 하지 말 것

- **Supabase / PostgreSQL 에 직접 접속하지 말 것.** DB 접속 정보는 제공되지 않으며 요구해서도 안 된다.
- **전역 등록 토큰(`PC_SETUP_TOKEN`)을 파일·레지스트리·로그·복제 이미지에 저장하지 말 것.**
- **Windows 제품키, AnyDesk 무인접속 비밀번호, 사용자 비밀번호를 서버로 보내지 말 것.**
  이 값들이 요청 본문에 있으면 서버가 `400 forbidden_field` 로 거절한다.
- **토큰과 요청 본문 전체를 로그에 남기지 말 것.** 로그에는 `deviceId` 앞 8자까지만.
- 서버 API 주소와 토큰 값을 소스에 하드코딩하지 말 것. 설정/입력으로 받는다.

---

## 2. 접속 정보

- Base URL: 별도 전달 (형태: `https://<vista-도메인>`)
- 전역 등록 토큰 `PC_SETUP_TOKEN`: 별도 전달. **이 문서에 적지 않는다.**
- 모든 호출은 HTTPS. 인증 헤더는 `Authorization: Bearer <토큰>`.

---

## 3. 인증 모델 — 2단계 토큰

이 설계의 핵심이다. 정확히 따르라.

### 전역 토큰 (`PC_SETUP_TOKEN`)

- **운영자가 세팅 도구 실행 시 직접 입력한다.** 복제 이미지에 굽지 않는다.
- 등록 요청을 보내는 동안만 메모리에 들고 있다가 **즉시 버린다.**
- 어떤 경우에도 디스크에 쓰지 않는다.

### 장비 토큰 (`deviceToken`)

- 전역 토큰으로 등록이 **성공하면** 응답의 `deviceToken` 필드에 평문이 **한 번만** 실려 온다.
  (서버에는 SHA-256 해시만 남는다. 다시 조회할 수 없다.)
- 이 토큰은 **자기 `deviceId` 만** 수정할 수 있다. 다른 장비를 수정하려 하면 `403 device_mismatch`.
- **Windows DPAPI (`ProtectedData.Protect`, scope = `CurrentUser`)** 로 감싸서 보관한다.
  권장 위치: `C:\ProgramData\HH\GolfPCSetup\device-token.bin`
- 이후 같은 PC 의 정보 갱신(AnyDesk 재초기화 등)은 이 토큰으로 보낸다. 전역 토큰을 다시
  물어보지 않는다.
- 분실·손상 시: 운영자가 전역 토큰을 다시 입력해 재등록하면 새 토큰이 발급되고 이전 토큰은
  무효가 된다.
- 장비 토큰으로는 `/api/pc-setup/catalog` 를 열 수 없다(전 매장 목록이므로 401).

---

## 4. `GET /api/pc-setup/catalog` — 매장·타석 목록

**전역 토큰 전용.** 현장에서 매장코드·타석코드를 손으로 적으면 오타가 난다. 이 목록으로
**드롭다운**을 만들어 고르게 하라.

요청:
```
GET /api/pc-setup/catalog
Authorization: Bearer <PC_SETUP_TOKEN>
```

응답 `200`:
```json
{
  "ok": true,
  "stores": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "code": "VISTA-SH",
      "name": "비스타파크골프 시흥점",
      "bays": [
        {
          "id": "aaaaaaaa-0001-4000-8000-000000000001",
          "bayCode": "A-01",
          "name": "A구역 1번 타석",
          "registered": true,
          "pcType": "park",
          "computerName": "PARK01"
        }
      ]
    }
  ]
}
```

- 드롭다운에는 `name` 을 보여주고, 등록 요청에는 **`id` (uuid)** 를 보내라. 코드 문자열보다
  안전하다.
- `registered: true` 인 타석은 **이미 다른 PC 가 등록된 자리**다. 목록에서 "이미 등록됨
  (`computerName`)" 으로 표시하라. 그 자리를 고르면 교체 흐름(7절)으로 간다.
- `pcType` / `computerName` 은 재설치 시 기본값으로 미리 채우는 데 쓴다.
- 매장·타석이 목록에 없으면 **도구가 만들 수 없다.** "VISTA 관리자 화면의 매장관리 /
  타석관리에서 먼저 추가해주세요" 라고 안내하고 중단하라.

---

## 5. `deviceId` 만드는 법

장비를 구분하는 해시다. **복제 SSD 를 그대로 쓴 PC 들이 서로 다른 값을 가져야 한다.**

- 형식: **소문자 16진수 32~128자** (`^[0-9a-f]{32,128}$`). SHA-256 hex(64자) 권장.
- 재료: 메인보드 UUID(`Win32_ComputerSystemProduct.UUID`) + 시스템 드라이브 일련번호 +
  MAC 주소 중 안정적인 것을 조합해 SHA-256.
- **요구조건: 같은 PC 에서 몇 번을 실행해도 같은 값이 나와야 한다.** 이 값이 멱등키다.
  PC 이름이나 타석 번호처럼 나중에 바뀌는 값을 재료에 넣지 마라.
- 계산한 값은 `C:\ProgramData\HH\GolfPCSetup\device-id.txt` 에 캐시해도 되지만,
  **매번 다시 계산해서 캐시와 다르면 다시 계산한 값을 쓰고 경고를 남겨라** (부품 교체 감지).

---

## 6. `POST /api/pc-setup/register` — 등록

요청 본문 상한 8 KiB.

```
POST /api/pc-setup/register
Authorization: Bearer <PC_SETUP_TOKEN 또는 deviceToken>
Content-Type: application/json
```

```json
{
  "deviceId": "3f9a...(소문자 hex 64자)",
  "storeId": "11111111-1111-4111-8111-111111111111",
  "bayId": "aaaaaaaa-0002-4000-8000-000000000002",
  "pcType": "park",
  "computerName": "PARK01",
  "anydeskId": "123 456 789",
  "windowsEdition": "Windows 11 IoT Enterprise",
  "windowsVersion": "24H2 (26100.2033)",
  "activationStatus": "licensed",
  "setupToolVersion": "3.4.0",
  "replace": false
}
```

| 필드 | 필수 | 규칙 |
|---|---|---|
| `deviceId` | ✅ | `^[0-9a-f]{32,128}$` |
| `storeId` 또는 `storeCode` | ✅ (둘 중 하나) | catalog 의 `id` 권장 |
| `bayId` 또는 `bayCode` | ✅ (둘 중 하나) | catalog 의 `id` 권장 |
| `pcType` | ✅ | `range`(골프연습장) \| `park`(파크골프) |
| `computerName` | ✅ | `^[A-Za-z0-9][A-Za-z0-9-]{0,62}$` — 예 `RANGE01`, `PARK01` |
| `anydeskId` | ✅ | 6~12자리 숫자. `123 456 789`, `123456789@ad` 도 받는다 |
| `windowsEdition` | | 120자 이하 |
| `windowsVersion` | | 120자 이하 |
| `activationStatus` | | `licensed` \| `unlicensed` \| `unknown` (생략 시 `unknown`) |
| `setupToolVersion` | | 40자 이하. `3.4.0` 처럼 |
| `replace` | | 기본 `false`. 7절 참고 |

### 값 수집 방법 (PowerShell 기준)

- `computerName` — `$env:COMPUTERNAME` (PC 이름 변경 **후** 읽을 것)
- `windowsEdition` — `(Get-CimInstance Win32_OperatingSystem).Caption`
- `windowsVersion` — `"$((Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion').DisplayVersion) ($([System.Environment]::OSVersion.Version.Build).$((Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion').UBR))"`
- `activationStatus` — `Get-CimInstance SoftwareLicensingProduct -Filter "PartialProductKey is not null and ApplicationID='55c92734-d682-4d71-983e-d6ec3f16059f'"` 의 `LicenseStatus` 가 `1` 이면 `licensed`, 조회 실패면 `unknown`.
  **`PartialProductKey` 나 제품키 자체는 절대 보내지 마라.**
- `anydeskId` — AnyDesk 초기화 후 `anydesk.exe --get-id` 출력. 숫자만 남긴다.

### 성공 응답 `200`

```json
{
  "ok": true,
  "action": "created",
  "storeId": "uuid",
  "bayId": "uuid",
  "bayCode": "A-02",
  "anydeskChanged": { "from": "987654321", "to": "123456789" },
  "replacedDeviceId": null,
  "warnings": [
    { "code": "computer_name_duplicate",
      "message": "PC 이름 PARK01 이(가) 다른 장비에도 쓰이고 있습니다.",
      "deviceIds": ["..."] }
  ],
  "deviceToken": "...(전역 토큰으로 등록했을 때만, 한 번만)",
  "registeredAt": "2026-09-19T05:12:00.000Z"
}
```

| `action` | 뜻 | 화면 표시 |
|---|---|---|
| `created` | 새 장비로 등록됨 | "등록 완료" |
| `updated` | 기존 장비 정보가 바뀜 | "정보 갱신됨" |
| `unchanged` | 값이 이전과 동일 | "이미 등록된 상태입니다" — **성공이다. 오류로 표시하지 마라** |

- `deviceToken` 이 응답에 있으면 **즉시 DPAPI 로 감싸 저장**하고 화면·로그에 출력하지 마라.
- `anydeskChanged` 가 있으면 "AnyDesk ID 가 `from` → `to` 로 변경되었습니다" 를 보여줘라.
- `warnings` 는 막지 말고 노란 경고로만 띄워라. `computer_name_duplicate` 는 보통 다른 매장에
  같은 이름을 쓴 것이다. 운영자가 판단한다.
- **멱등하다.** 같은 `deviceId` 로 같은 내용을 여러 번 보내도 행은 하나다. 재시도해도 안전하다.

---

## 7. 오류 처리

| HTTP | `code` | 재시도 | 도구 동작 |
|---|---|---|---|
| 401 | `unauthorized` | ❌ | 토큰이 틀렸다. 전역 토큰 재입력 요청 |
| 403 | `device_mismatch` | ❌ | 저장된 장비 토큰이 이 PC 것이 아니다. 토큰 파일 삭제 후 전역 토큰으로 재등록 |
| 400 | `invalid_payload` | ❌ | `field` 가 가리키는 항목을 고치게 한다 |
| 400 | `forbidden_field` | ❌ | **버그다.** `field` 에 적힌 값을 요청에서 제거하라 |
| 404 | `store_not_found` | ❌ | "관리자 화면 매장관리에서 매장을 먼저 추가해주세요" |
| 404 | `bay_not_found` | ❌ | "관리자 화면 타석관리에서 타석을 먼저 추가해주세요" |
| 409 | `anydesk_id_taken` | ❌ | **하드 에러.** `replace` 로도 통과 못 한다. 아래 참고 |
| 409 | `slot_occupied` | ❌ | 교체 확인 흐름으로 (아래) |
| 413 | `payload_too_large` | ❌ | 본문 축소 |
| 5xx / 네트워크 / 타임아웃 | `server_error` 등 | ✅ | **오프라인 큐에 적재** (8절) |

**4xx 는 절대 자동 재시도하지 마라.** 사람이 고쳐야 하는 오류다.

### `anydesk_id_taken`

이 AnyDesk ID 를 다른 장비가 이미 쓰고 있다. 거의 항상 **AnyDesk 초기화가 제대로 안 돼서
복제된 ID 가 그대로 남은 경우**다.

```json
{ "ok": false, "code": "anydesk_id_taken",
  "message": "이 AnyDesk ID 는 다른 장비에 이미 등록되어 있습니다.",
  "conflict": { "deviceId": "...", "computerName": "PARK01", "anydeskId": "123456789", "bayCode": null } }
```

→ "AnyDesk 설정이 복제된 상태입니다. 초기화를 다시 실행하세요" 를 띄우고, AnyDesk 초기화
단계로 되돌려라. `replace: true` 를 붙여 재시도하지 마라. 서버가 거절한다.

### `slot_occupied`

그 타석에 이미 다른 PC 가 등록되어 있다.

```json
{ "ok": false, "code": "slot_occupied",
  "message": "A-02 타석에는 이미 다른 PC(PARK01)가 등록되어 있습니다.",
  "conflict": { "deviceId": "...", "computerName": "PARK01", "anydeskId": "987654321", "bayCode": "A-02" } }
```

→ `conflict` 내용을 그대로 보여주고 **운영자에게 확인을 받아라**:

> A-02 타석에는 이미 `PARK01` (AnyDesk 987654321) 이 등록되어 있습니다.
> 이 PC 로 **교체**하시겠습니까? 기존 등록은 삭제되고 교체 이력이 남습니다.
> [교체한다] [취소]

"교체한다" 를 누르면 **같은 요청에 `replace: true` 만 더해** 재전송한다.
자동으로 `replace: true` 를 보내지 마라. 반드시 사람이 확인한다.

---

## 8. 오프라인 큐

서버가 안 될 때(5xx·네트워크·타임아웃)만 동작한다.

1. **요청 본문(payload)만** `C:\ProgramData\HH\GolfPCSetup\pending-registration.json` 에 저장.
   **토큰은 저장하지 않는다.**
2. 화면에 "서버에 연결하지 못했습니다. 다음 실행 때 다시 전송합니다" 를 띄우고,
   나머지 세팅 단계는 계속 진행한다. 등록 실패가 세팅 전체를 막으면 안 된다.
3. 다음 실행 시 대기 파일이 있으면:
   - 저장된 장비 토큰이 있으면 그 토큰으로 바로 전송한다.
   - 없으면 **운영자에게 전역 토큰을 다시 입력받아** 전송한다.
4. 성공(2xx)하면 대기 파일을 삭제한다. 4xx 를 받아도 삭제하고 오류를 보여준다
   (재시도해도 같은 결과다). 5xx 면 파일을 남기고 다음 실행을 기다린다.
5. 대기 파일에 `queuedAt` 을 기록하고, **7일 이상 된 항목은 전송 전에 값을 다시 수집**하라.
   그 사이 PC 이름이나 AnyDesk ID 가 바뀌었을 수 있다.

**VISTA 타석 관리 프로그램(Agent)에 재전송을 맡기지 마라.** 골프연습장 PC 에는 그 프로그램이
없고, 맡기면 Agent 에게 등록 토큰을 쥐여주게 된다.

---

## 9. 실행 순서

```
1. deviceId 계산
2. 대기 중인 등록 요청이 있는가?  → 있으면 8절 3번으로 먼저 처리
3. PC 이름 변경 / 제품키 / Windows Update 차단  (기존 기능)
4. AnyDesk 복제 설정 초기화 → 새 ID 확인        (기존 기능)
5. 저장된 장비 토큰이 있는가?
     있음 → 그 토큰 사용, catalog 호출 생략(이전 선택 재사용)
     없음 → 운영자에게 전역 토큰 입력받기 → GET /api/pc-setup/catalog
            → 매장·타석 드롭다운 선택 → pcType 선택
6. POST /api/pc-setup/register
7. 성공: deviceToken 이 있으면 DPAPI 로 저장. action 에 맞는 메시지 표시
   409 slot_occupied: 확인받고 replace:true 로 재전송
   409 anydesk_id_taken: 4번으로 되돌리기
   4xx: 오류 표시, 중단
   5xx/네트워크: 대기 파일에 저장, 계속 진행
8. 센서 및 타격 확인                              (기존 기능)
```

---

## 10. 완료 기준

서버 없이도 확인할 수 있는 것부터 테스트하라. 스텁 서버로 각 응답을 흉내 내면 된다.

- [ ] `deviceId` 가 같은 PC 에서 반복 실행해도 동일하다
- [ ] 전역 토큰이 디스크 어디에도 기록되지 않는다 (파일·레지스트리·로그 전수 확인)
- [ ] `deviceToken` 이 DPAPI 로 감싸여 저장되고, 평문이 로그·화면에 나오지 않는다
- [ ] 로그에 `Authorization` 헤더와 요청 본문 전체가 없다. `deviceId` 는 앞 8자만
- [ ] 제품키·비밀번호가 요청 본문에 없다
- [ ] `action: "unchanged"` 를 성공으로 표시한다
- [ ] `slot_occupied` 에서 사람 확인 없이 `replace: true` 를 보내지 않는다
- [ ] `anydesk_id_taken` 에서 AnyDesk 초기화 단계로 되돌아간다
- [ ] 4xx 를 자동 재시도하지 않는다
- [ ] 5xx·네트워크 오류에서 payload 만 큐에 남고 세팅은 계속 진행된다
- [ ] 큐에 있던 요청이 다음 실행에서 전송되고 성공 시 파일이 삭제된다
- [ ] 매장·타석이 catalog 에 없을 때 "관리자 화면에서 먼저 추가" 를 안내하고 중단한다

---

## 11. 서버 쪽 현황 (참고)

- 구현 완료: `POST /api/pc-setup/register`, `GET /api/pc-setup/catalog`,
  관리자 화면 `/admin/remote-access` (매장·타석·PC이름·AnyDesk ID·Windows·마지막 등록 시각,
  ID 복사, `anydesk:` 연결, 변경 이력)
- 저장 위치: Supabase PostgreSQL `bay_pc_registry`, `bay_pc_anydesk_history`
- 서버에 저장하지 않는 것: 비밀번호, Windows 제품키, AnyDesk 무인접속 비밀번호
- 전체 서버 규격 문서: `docs/pc-setup-api.md`

규격에 빠진 것이 있거나 모순이 보이면 **임의로 정하지 말고 질문하라.**
