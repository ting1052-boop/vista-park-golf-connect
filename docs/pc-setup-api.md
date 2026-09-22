# HH 골프 PC 세팅 도구 ↔ VISTA 서버 연동 규격

대상: HH 골프 PC 세팅 도구 v3.4
서버: VISTA Park Golf Connect (Next.js / Vercel, Supabase PostgreSQL)
작성: 2026-09-19

복제 SSD 로 배포한 PC 가 자기 AnyDesk 주소를 VISTA 서버에 등록하고, 관리자 화면에서
매장·타석별로 조회·연결할 수 있게 한다. 세팅 도구는 Supabase 에 직접 접속하지 않는다.

---

## 1. 왜 별도 표인가 (agent_devices 를 확장하지 않은 이유)

`agent_devices` 는 "VISTA Agent 가 설치된 타석 PC" 를 뜻한다. `token_hash` 의 NOT NULL 만
풀면 Agent 없는 골프연습장 PC 도 넣을 수 있을 것처럼 보이지만, 그 표의 **행 하나하나가
다른 기능의 입력**이라 의미가 깨진다. 확인한 곳:

| 파일 | 하는 일 | 빈 행이 들어가면 |
|---|---|---|
| `src/lib/supabase/bays-server.ts:149` | `last_seen_at` 로 타석 PC 켜짐/꺼짐 판정 | 영영 꺼진 타석으로 표시 |
| `src/lib/store-controller.ts:241,266` | `enqueueBayAgentShutdown` / `enqueueStoreAgentShutdowns` | 없는 Agent 에 종료 명령을 큐잉 |
| `src/app/api/admin/automation/route.ts:113` | 무인제어 화면 PC 목록 | 목록 오염 |
| `src/lib/agent-server.ts:49` | 토큰으로 Agent 인증 | (null 토큰은 매칭 안 되므로 안전) |
| `supabase/migrations/202609170001_agent_round_events.sql:47` | `agent_device_id` FK, 라운드 이벤트 | — |
| `supabase/agent-devices-siheung-template.sql` | 토큰 발급 upsert | `token_hash` 필수 전제 |

또한 `agent_devices` 는 `unique(bay_id)` 라 한 타석에 한 행이다. Agent 가 있는 파크골프
타석과 PC 등록 정보가 같은 행을 두고 다투게 된다.

→ **`bay_pc_registry` 를 새로 만든다.** Agent 가 있든 없든 모든 PC 를 담는다.

`pc_type`(range/park)도 `stores` 가 아니라 이 표에 둔다. 한 매장이 연습장과 파크골프를
함께 둘 가능성을 지금 부정할 수 없다. 매장 단위로 확정되면 나중에 `stores` 로 올리는 편이
쉽지, 그 반대는 어렵다.

---

## 2. 마이그레이션

`supabase/migrations/202609190001_bay_pc_registry.sql`

### `public.bay_pc_registry`

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid pk | |
| `device_id` | text **unique** | 세팅 도구가 만든 하드웨어 해시 (소문자 hex 32~128) |
| `store_id` | uuid → `stores(id)` cascade | |
| `bay_id` | uuid → `bays(id)` cascade, **unique** | 한 타석에 PC 하나 |
| `pc_type` | text | `range` \| `park` |
| `computer_name` | text | `^[A-Za-z0-9][A-Za-z0-9-]{0,62}$` |
| `anydesk_id` | text **unique** | `^[0-9]{6,12}$` |
| `windows_edition` / `windows_version` | text null | |
| `activation_status` | text | `licensed` \| `unlicensed` \| `unknown` |
| `setup_tool_version` | text null | |
| `device_token_hash` | text unique null | 장비 토큰의 SHA-256 |
| `device_token_issued_at` | timestamptz null | |
| `registered_at` | timestamptz | 마지막 등록 시각 (값이 같아도 갱신) |
| `created_at` / `updated_at` | timestamptz | `set_updated_at` 트리거 |

인덱스: `bay_pc_registry_store_name_idx (store_id, computer_name)`

**PC 이름에는 유니크 제약을 두지 않는다.** 요구사항이 "교체 여부 확인"이지 거부가 아니고,
이미 중복이 있는 DB 에서 마이그레이션이 깨진다. 서버가 `warnings` 로 알린다.

### `public.bay_pc_anydesk_history`

`id`, `device_id`, `bay_id`, `previous_anydesk_id`, `new_anydesk_id`, `changed_at`,
`change_source`(`setup_tool` \| `admin` \| `replace`)

인덱스: `(device_id, changed_at desc)`, `(bay_id, changed_at desc)`

### RLS

두 표 모두 RLS 를 켜고 **정책을 두지 않는다.** `device_token_hash` 가 들어 있어서
브라우저 세션(anon/authenticated)에는 열지 않는다. `service_role` 만 읽고 쓰며, 관리자
화면은 `/api/admin/remote-access` 를 거친다.

---

## 3. 인증

### 등록 창구 — 토큰 없는 최초 등록

현장에서 토큰을 입력하지 않는다. 대신 **관리자가 설치 작업 동안만 매장별 창구를 연다.**

프로그램에 고정 식별값을 넣는 방법은 쓰지 않았다. 이 저장소는 공개이고, 배포 파일에서도
읽을 수 있는 값은 한 번 정하면 영구히 유출된 것과 같다. 그 값이면 누구나 catalog 로 전
매장 타석을 훑고 `replace: true` 로 AnyDesk ID 를 자기 것으로 덮어쓸 수 있다. 관리자가
원격접속 화면에서 연결을 누르면 매장 PC 가 아니라 그쪽으로 붙는다.

값을 없애는 대신 시간을 좁혔다.

- 관리자 화면 **원격접속 → PC 등록 창구**에서 매장별로 **30분 / 최대 10대** 창을 연다.
- 창이 열린 동안 그 매장 타석에 한해 `Authorization` 헤더 없이 등록할 수 있다.
- 시간이 지나거나 대수를 채우면 자동으로 닫힌다. 새 장비 등록만 대수를 소모한다.
- 최초 등록이 성공하면 장비별 `deviceToken` 을 발급한다. 이후 그 PC 의 갱신은 창구와
  무관하게 언제든 된다.
- 창이 닫힌 상태의 요청은 `401 enrollment_closed`.
- AnyDesk ID 중복 차단, 타석 점유 충돌, 교체 확인은 그대로다.

`GET /api/pc-setup/catalog` 도 토큰 없이 열리지만, **창이 열린 매장만** 돌려준다.
열린 매장이 하나도 없으면 `401 enrollment_closed`.

### 전역 등록 토큰 `PC_SETUP_TOKEN` (운영 복구용)

- 서버 환경변수. Vercel 에 설정한다.
- **복제 이미지에 굽지 않는다.** 운영자가 세팅 도구 실행 시 입력한다.
- 세팅 도구는 등록 요청 동안만 메모리에 들고, 파일에 쓰지 않는다.
- 전송 실패 시 **payload 만** 로컬 큐에 저장하고, 다음 실행에서 토큰을 다시 입력받는다.

### 장비 토큰 `deviceToken`

- 전역 토큰으로 등록이 성공하면 응답의 `deviceToken` 에 평문이 **한 번만** 실려 나온다.
  서버에는 SHA-256 해시만 남는다.
- 이 토큰은 **자기 `deviceId` 만** 수정할 수 있다. 다른 장비를 건드리면 `403 device_mismatch`.
- 클라이언트는 Windows DPAPI(`CurrentUser` 범위)로 감싸 보관한다.
- 분실 시 운영자가 전역 토큰으로 다시 등록하면 새 토큰이 발급되고 이전 토큰은 무효가 된다.
- 장비 토큰으로는 `/api/pc-setup/catalog` 를 열 수 없다(전 매장 목록이므로).

헤더: `Authorization: Bearer <토큰>` · HTTPS 만.

---

## 4. `GET /api/pc-setup/catalog`

매장·타석 드롭다운용. **HH 세팅 도구 자동등록 또는 전역 복구 토큰으로 조회한다.**

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

- `status = 'closed'` 인 매장은 제외한다.
- `registered` / `pcType` / `computerName` 은 이미 등록된 타석의 현재 값이다. 재설치 시
  세팅 도구가 기존 선택을 미리 채우는 데 쓴다.
- 처음 제안서의 `storeType` 은 넣지 않았다. PC 종류를 매장 속성으로 확정하지 않았기 때문이다.
  세팅 도구에서 `range`/`park` 를 고르고, 이미 등록된 타석이면 `bays[].pcType` 을 기본값으로 쓴다.

---

## 5. `POST /api/pc-setup/register`

요청 본문 상한 8 KiB.

```json
{
  "deviceId": "3f9a…(소문자 hex 32~128)",
  "storeCode": "VISTA-SH",
  "bayCode": "A-02",
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

- `storeCode` 대신 `storeId`(uuid), `bayCode` 대신 `bayId`(uuid) 도 받는다. catalog 를 쓴다면
  uuid 쪽이 오타가 없다.
- `anydeskId` 는 `123 456 789`, `123456789@ad`, 숫자 모두 받아 숫자만 남긴다.
- `activationStatus` 생략 시 `unknown`.
- `replace` 생략 시 `false`.

### WOL·네트워크 필드 (선택)

전부 생략 가능하다. 보내면 관리자 화면에서 꺼진 PC 를 깨울 수 있다.

```json
{
  "wolMacAddress": "AABBCCDDEEFF",
  "macAddresses": [
    { "address": "AABBCCDDEEFF", "type": "ethernet", "name": "Intel Ethernet I219-V" },
    { "address": "112233445566", "type": "wifi", "name": "Intel Wi-Fi 6 AX201" }
  ],
  "ipv4Address": "192.168.0.25",
  "networkPrefixLength": 24,
  "wolBroadcastAddress": "192.168.0.255",
  "wakeOnLanStatus": "enabled",
  "powerControlMethod": "wol_agent",
  "networkCollectedAt": "2026-09-22T12:00:00.000Z"
}
```

| 필드 | 규칙 |
| --- | --- |
| `wolMacAddress` | 구분자 없는 12자리(대문자로 정규화). 콜론·하이픈 표기도 받는다. **`macAddresses` 안에 있어야 한다** |
| `macAddresses` | 최대 16개. `type` 은 `ethernet` \| `wifi`. 중복 주소는 하나로 합친다 |
| `ipv4Address` | IPv4. 보내면 `networkPrefixLength` 도 **필수** |
| `networkPrefixLength` | 0~32 정수 |
| `wolBroadcastAddress` | IPv4. **IP 와 prefix 로 계산한 값과 다르면 거절한다** |
| `wakeOnLanStatus` | `enabled` \| `disabled` \| `unknown` (생략 시 `unknown`) |
| `powerControlMethod` | `wol_agent` \| `wol_only` \| `unknown` |
| `networkCollectedAt` | ISO 날짜 |

**유선 NIC 를 골라야 한다.** Wi-Fi 는 WOL 이 사실상 안 되고, VirtualBox·WSL·Hyper-V·VPN
가상 어댑터는 WOL 대상이 아니다. 가상 어댑터 MAC 은 PC 끼리 겹치기도 한다.

```powershell
Get-NetAdapter -Physical |
  Where-Object { $_.Status -eq 'Up' -and $_.MediaType -eq '802.3' } |
  Sort-Object InterfaceMetric | Select-Object -First 1
```

`wakeOnLanStatus` 를 정확히 보내려면 세팅 도구가 WOL 을 **설정까지** 해야 한다.
안 되는 원인 1위는 MAC 이 아니라 Windows 빠른 시작이다.

```powershell
powercfg /hibernate off                       # 빠른 시작 끄기
Enable-NetAdapterPowerManagement -Name $nic -WakeOnMagicPacket
(Get-NetAdapterPowerManagement -Name $nic).WakeOnMagicPacket   # 결과를 그대로 보고
```

BIOS 의 WOL 항목은 프로그램이 못 켠다. 원본 PC 에서 켜고 복제한다.
- **`password`, `anydeskPassword`, `unattendedPassword`, `productKey`, `windowsProductKey`,
  `licenseKey` 가 들어 있으면 `400 forbidden_field` 로 거절한다.** 조용히 버리면 세팅 도구가
  계속 보내게 된다.

### 성공 응답

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
    { "code": "computer_name_duplicate", "message": "PC 이름 PARK01 이(가) 다른 장비에도 쓰이고 있습니다.", "deviceIds": ["…"] }
  ],
  "deviceToken": "…(전역 토큰으로 등록했을 때만, 한 번만)",
  "registeredAt": "2026-09-19T05:12:00.000Z"
}
```

| `action` | 뜻 |
|---|---|
| `created` | 새 `deviceId` |
| `updated` | 기존 장비의 값이 바뀜 |
| `unchanged` | **PC 정보가 이전과 동일.** `registered_at` 은 그래도 갱신된다 |

- 멱등키는 `deviceId` 다. 같은 내용을 여러 번 보내도 행은 하나다.
- `anydeskChanged` 가 있으면 이력에 한 줄 남는다.
- 모든 시각은 **서버 시각**으로 기록한다. 클라이언트 시계를 믿지 않는다.

### 오류

| HTTP | `code` | 뜻 | 세팅 도구 동작 |
|---|---|---|---|
| 401 | `unauthorized` | 토큰 없음/불일치 | 토큰 재입력 |
| 403 | `device_mismatch` | 장비 토큰으로 다른 `deviceId` 수정 시도 | 전역 토큰으로 재등록 |
| 400 | `invalid_payload` | 형식 오류. `field` 동봉 | 해당 항목 수정 |
| 400 | `forbidden_field` | 비밀번호·제품키 포함. `field` 동봉 | 요청에서 제거 |
| 404 | `store_not_found` | 매장 미등록 | "관리자 화면 매장관리에서 먼저 추가" 안내 |
| 404 | `bay_not_found` | 타석 미등록 | "관리자 화면 타석관리에서 먼저 추가" 안내 |
| 409 | `anydesk_id_taken` | 다른 장비가 이 AnyDesk ID 보유 | **하드 에러. `replace` 로도 통과 불가.** 해당 PC 의 AnyDesk 를 먼저 초기화 |
| 409 | `slot_occupied` | 이 타석에 다른 `deviceId` 등록됨 | `conflict` 를 보여주고 확인받은 뒤 `replace: true` 로 재전송 |
| 413 | `payload_too_large` | 8 KiB 초과 | 본문 축소 |
| 500 | `server_error` | 서버/DB 오류 | **로컬 큐에 적재 후 재시도** |

409 응답에는 상대 장비 정보가 실린다:

```json
{ "ok": false, "code": "slot_occupied", "message": "A-02 타석에는 이미 다른 PC(PARK01)가 등록되어 있습니다.",
  "conflict": { "deviceId": "…", "computerName": "PARK01", "anydeskId": "987654321", "bayCode": "A-02" } }
```

`replace: true` 로 재전송하면 기존 행을 지우고 새 장비가 그 타석을 차지하며,
이력에 `change_source: "replace"` 한 줄이 남는다.

### 로그

요청 본문과 `Authorization` 헤더는 어디에도 기록하지 않는다. 오류 로그에는
`deviceIdPrefix`(앞 8자) 와 사유만 남는다 (`redactForLog`).

---

## 6. 오프라인 큐 (세팅 도구 담당)

VISTA Agent 에 맡기지 않는다. 골프연습장 PC 에는 Agent 가 없고, Agent 에게
`PC_SETUP_TOKEN` 을 쥐여주게 된다.

1. 전송 실패(네트워크 / 5xx) 시 **payload 만** `C:\ProgramData\HH\GolfPCSetup\pending-registration.json` 에 저장. 토큰은 저장하지 않는다.
2. 다음 실행 때 대기 파일이 있으면 저장된 장비 토큰으로 보낸다. 토큰이 없으면 토큰 없이
   보내고, `401 enrollment_closed` 가 오면 관리자에게 창구를 열어달라고 안내한다.
3. 성공하면 대기 파일을 지우고 `deviceToken` 을 DPAPI 로 감싸 저장한다.
4. 이후 값 변경(예: AnyDesk 재초기화)은 `deviceToken` 으로 보낸다. 실패하면 다시 1번.

4xx(`invalid_payload`, `forbidden_field`, `anydesk_id_taken`)는 **재시도하지 않는다.**
사람이 고쳐야 하는 오류다.

---

## 7. 관리자 화면

`/admin/remote-access` (좌측 메뉴 **원격접속**, 무인제어 바로 아래)

- 매장 · 타석 · 구분 · PC 이름 · AnyDesk ID · Windows(에디션/버전/정품인증) · 마지막 등록 시각
- AnyDesk ID 복사 버튼
- 연결 버튼 — `anydesk:<id>` 프로토콜. 관리자 PC 에 AnyDesk 가 설치돼 있으면 바로 열린다.
  무인접속 비밀번호는 링크에 넣지 않는다.
- ID 변경 이력 토글 (`GET /api/admin/remote-access?deviceId=…`)
- **수동 등록 폼** (화면 위쪽) — 세팅 도구를 돌릴 수 없는 PC 를 손으로 넣는다.
  `POST /api/admin/remote-access` (관리자 로그인 필요)

### 수동 등록

세팅 도구와 **같은 경로**(`registerBayPc`)를 타므로 중복 검사·이력 기록이 동일하다.
다른 점은 셋뿐이다.

| | 세팅 도구 | 수동 등록 |
| --- | --- | --- |
| `deviceId` | PC 하드웨어 해시 | 서버가 임의 생성 (손으로 넣는 PC 에는 해시가 없다) |
| 장비 토큰 | 발급 | **발급하지 않음** (그 PC 가 스스로 보고한다는 뜻이 아니므로) |
| 이력 `change_source` | `setup_tool` | `admin` |

`setup_tool_version` 에 `manual` 이 들어가고 화면에는 "수동 등록" 으로 보인다.

나중에 그 PC 가 세팅 도구로 **진짜 `deviceId`** 를 들고 오면 같은 타석이라
`slot_occupied` 가 난다. 관리자가 교체를 확인하면 손으로 넣은 줄이 진짜 값으로 바뀌고
교체 이력이 남는다. 즉 수동 등록은 세팅 도구 배포 전까지의 임시 기록으로 쓰고,
도구가 돌면 자연스럽게 정본으로 교체된다.

**타석관리**(`/admin/bays`) 표에도 읽기 전용 `AnyDesk` 열이 붙는다.

접근 제어는 두 겹이다. `src/middleware.ts` 가 `/admin/:path*` 를 로그인 없이는
`/admin/login` 으로 돌리고, `/api/admin/remote-access` 가 `requireAdminUser()` 로 다시 본다.
API 응답에는 `device_token_hash` 를 절대 싣지 않는다.

---

## 8. 변경한 파일

**신규**
- `supabase/migrations/202609190001_bay_pc_registry.sql`
- `src/lib/pc-registry-payload.ts` — 요청 해석·검증·로그 마스킹 (DB 비의존)
- `src/lib/pc-registry-payload.test.ts` — `node --test src/lib/pc-registry-payload.test.ts`
- `src/lib/pc-registry.ts` — 토큰 판별, 중복 검사, upsert, 이력
- `src/app/api/pc-setup/register/route.ts`
- `src/app/api/pc-setup/catalog/route.ts`
- `src/app/api/admin/remote-access/route.ts`
- `src/app/admin/remote-access/page.tsx`, `remote-access-client.tsx`

**수정**
- `src/lib/dashboard-data.ts` — `원격접속` 메뉴
- `src/components/admin-shell.tsx` — 메뉴 아이콘
- `src/components/admin-crud-page.tsx` — 읽기 전용 열 옵션(`extraColumns` / `extraValues`)
- `src/app/admin/bays/page.tsx` — AnyDesk 열
- `tsconfig.json` — `allowImportingTsExtensions`(테스트가 `.ts` 를 직접 import)

**재사용**: `getBearerToken` (`src/lib/agent-server.ts`), `createSupabaseAdminClient`,
`requireAdminUser`, `set_updated_at` 트리거

---

## 9. 검증 결과

- `node --test src/lib/pc-registry-payload.test.ts` — 6/6 통과
- `npm run typecheck` (tsc --noEmit) — 통과
- `npm run lint` (eslint) — 통과
- 로컬 dev 서버 실호출:

| 요청 | 결과 |
|---|---|
| 토큰 없음 | `401 unauthorized` |
| 잘못된 토큰 | `401 unauthorized` (등록부 표가 없어도 fail-closed) |
| `password` 포함 | `400 forbidden_field` (`field: password`) |
| 짧은 `deviceId` | `400 invalid_payload` (`field: deviceId`) |
| 매장 식별자 없음 | `400 invalid_payload` (`field: storeId`) |
| 없는 `storeCode` | `404 store_not_found` |
| catalog 토큰 없음 | `401 unauthorized` |
| catalog 전역 토큰 | `200`, 매장 2곳·타석 목록 반환 |
| `/api/admin/remote-access` 비로그인 | `401` |
| `/admin/remote-access` 비로그인 | `307 → /admin/login` |

**아직 안 한 것**: 마이그레이션은 운영 DB 에 적용하지 않았다(사용자 승인 필요).
등록 성공 경로(`created` / `updated` / `unchanged` / `slot_occupied` / `anydesk_id_taken`)는
표가 생긴 뒤에 검증해야 한다.

---

## 10. 배포 전 할 일

1. 마이그레이션 적용 (`202609190001_bay_pc_registry.sql`, `202609210003_pc_enrollment_window.sql`)
2. 필요하면 운영 복구용 Vercel 환경변수 `PC_SETUP_TOKEN` 설정 (32바이트 이상 랜덤)
3. 관리자 화면 매장관리에서 골프연습장 매장 추가, 타석관리에서 타석 추가
4. 테스트 PC 1대로 `created` → `unchanged` → AnyDesk 변경 → `slot_occupied` → `replace` 순서 확인
