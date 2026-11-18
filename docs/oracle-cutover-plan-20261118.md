# Vercel → Oracle 전환 계획 (정상 서비스 기준)

작성: 2026-11-18, Claude Code. Codex 의 `docs/oracle-migration-20261118.md` 와 원장 최신 요약,
그리고 이 저장소 코드를 직접 확인해 세운 계획이다. 확인하지 못한 외부 사실은 **[출처 확인]** 으로 표시했다.

---

## 0. 한 장 요약

- **앱 코드는 그대로 옮길 수 있다.** `src/` 에 Vercel 전용 기능이 없다(`@vercel/*`, edge runtime,
  `next/image`, Vercel cron 모두 없음. `next.config.mjs` 는 기본값, `vercel.json` 은 `{}`) — 이 부분은
  코드로 직접 확인했다. Oracle 에서 52개 페이지 빌드와 본사 로그인·매장 전환이 성공했다는 것은
  **Codex 의 기록**이며, 이번 검토에서 서버에 접속해 다시 확인하지는 않았다.
- **어려운 것은 서버가 아니라 "주소를 쓰는 쪽"이다.** 현장 PC Agent, 매장 제어기, HA, PC 세팅 도구,
  키오스크, 고객 링크가 `vista-park-golf-connect.vercel.app` 을 쓴다. 이 주소는 Vercel 소유라
  DNS 로 옮길 수 없다.
- **전략: 우리가 관리하는 안정적인 주소(새 도메인 또는 이미 가진 도메인의 하위 주소)를 먼저 Vercel 에
  붙이고 → 모든 사용처를 그 주소로 옮기고 → 마지막에 DNS 만 Oracle 로 바꾼다.** 두 서버는 같은
  Supabase DB 를 쓰므로 데이터 이전이 없다. 되돌리기도 DNS 로 하지만 **즉시는 아니다**: DNS 캐시
  때문에 한동안 요청이 두 서버로 나뉜다(P5 참고).
- **보안 구멍이 먼저다(2절).** Supabase 가입이 누구에게나 열려 있고, `/api/admin` 아래 API 두 개가
  로그인만 확인했다(2026-11-18 수정 커밋 `4ee3b8b`, 로그인 음성 시험 대기). 지금 Vercel 운영에도
  해당하며, 이게 검증되기 전에는 Oracle 의 앞문 인증을 걷어낼 수 없다.

### Vercel 해지 조건 (넷 다 충족해야 한다)

1. `vercel.app` 주소를 쓰는 현장·고객 사용처가 0 이다(관측으로 확인).
2. 비밀값과 설정 플래그가 두 서버에서 같다.
3. 보안 수정이 "막혀야 할 접근이 막히는지" 시험(음성 시험)을 통과했다.
4. Oracle 에서 배포·재시작·되돌리기·감시 알림·인증서 갱신이 실제로 검증됐다.

---

## 1. Codex 작업 검토 결과

### 잘 된 것

- 서버 구성: 비root 서비스 계정, 앱은 내부(127.0.0.1:3000)에서만 열림, systemd 보호 옵션
  (`NoNewPrivileges`, `ProtectSystem=strict`, `PrivateTmp`, `UMask=0077`), 쓰기 경로는 `.next` 만.
- 비밀값 취급: `/etc/vista/web.env` root 0600, 화면·원장·Git 에 값 없음. 마스킹된 Vercel 값을
  억지로 우회하지 않았다.
- 릴리스 디렉터리 + `current` 심볼릭 링크 구조로 되돌리기를 설계했다.
- 시험 공개 시 전체 경로에 앞문 인증(basicauth)을 걸고, 앱으로는 그 인증 헤더를 넘기지 않았다.
  권한 문제를 이유로 무방비 공개를 보류한 판단이 옳았다.
- 깨끗한 운영 커밋(`936fe00`)만 빌드했고, 더러운 작업 폴더를 통째로 올리지 않았다.

### 보완이 필요한 것

| 항목 | 현재 | 필요한 것 |
| --- | --- | --- |
| 배포 | 수동 tar 업로드 + 서버에서 빌드 | 한 번에 끝나는 배포 스크립트(커밋 지정 → 빌드 → 링크 전환 → 재시작 → 헬스체크 실패 시 자동 되돌리기) |
| 헬스체크 | **엔드포인트 없음** | 두 단계로 나눈다. 자주 부르는 생존 확인은 DB 를 건드리지 않는 가벼운 응답, DB 연결 확인은 낮은 빈도로만. 비밀값 미노출. 새 비용 원인(Supabase 호출 증가)이 되지 않게 한다 |
| 감시·알림 | 없음 | 외부 가동 감시 + 휴대폰/메일 알림 |
| 재시작 정책 | `Restart=on-failure`, `StartLimitIntervalSec=60`·`StartLimitBurst=5` 라 60초에 5번 실패하면 멈춘다 | `Restart=always` 로 바꿔도 **시작 횟수 제한은 그대로 적용된다.** 제한값을 무인 운영에 맞게 정하고, 제한에 걸려 멈추면 `OnFailure=` 로 알림을 보내며, 그 뒤 복구 방법(자동 재시도 타이머 또는 사람이 확인)을 함께 정한다. 근거: systemd 공식 문서 https://freedesktop.org/software/systemd/man/latest/systemd.service.html |
| 공인 IP | 임시(ephemeral) IP | 고정(reserved) IP **[출처 확인: Always Free 한도]** |
| 주소 | `161-33-159-106.sslip.io` 임시 | 우리가 관리하는 안정적인 주소(새 도메인 또는 보유 도메인의 하위 주소) |
| 제어기 플래그 | 시험 서버는 `STORE_CONTROLLER_ENABLED=false` | 전환 시 운영과 동일하게 `true` |
| 비밀값 | service-role 만 반영 | 나머지 마스킹 값의 회수/재발급(5절) |
| OS 보안 업데이트 | 10개 대기 | 자동 보안 업데이트 |
| 커밋 상태 | `deploy/`, 이전 문서 미커밋, 스크린샷 7장이 저장소 루트에 있음 | 스크린샷은 저장소 밖으로, 나머지는 검토 후 커밋 |

참고: `src/lib/poll-maintenance.ts` 는 프로세스 메모리로 30초 간격을 거는 방식이다. Vercel 처럼
인스턴스가 여러 개면 인스턴스마다 따로 돌지만, Oracle 은 프로세스가 하나라 오히려 의도대로 동작한다.
DB 조건부 갱신이 실제 중복 방지를 맡고 있어 문제는 없다.

---

## 2. 즉시 조치 — 전환과 무관하게 지금 운영에도 필요

### S1. Supabase 공개 가입 막기 (사용자, 대시보드 설정 1개)

- 2026-11-18 공개 설정 조회 결과: `disable_signup: false`, 이메일 가입 허용, 이메일 확인 필요.
  **누구나 자기 이메일로 가입·확인 후 로그인할 수 있다.**
- 앱 코드에 가입 기능(`signUp`)을 쓰는 곳이 없고, 카카오 로그인은 꺼져 있다. 관리자 계정은 본사가
  Supabase 에서 직접 만든다. **막아도 깨지는 기능이 없다.**
- 방법: Supabase → Authentication → Sign In / Providers → "Allow new users to sign up" 끄기.
  (메뉴 이름은 Supabase 화면 개편에 따라 조금 다를 수 있다.)
- **이것은 임시 방어다.** 새 가입만 막을 뿐, 이미 만들어진 계정의 접근은 막지 못한다. 그래서
  S2(API 권한 수정)가 반드시 필요하다.
- 모르는 계정은 **바로 지우지 않는다.** Authentication → Users 에서 생성일, 마지막 로그인,
  `public.users` 역할, `store_users` 매장 배정, 실제 사용 흔적을 먼저 확인해 목록으로 만들고,
  **삭제는 별도 승인 후** 처리한다.
- 부작용: 나중에 고객 카카오 로그인을 켜면, 가입이 막혀 있어 처음 오는 회원도 막힌다. 그때는
  가입을 다시 열기 전에 S2·S3 가 끝나 있어야 한다.
- 근거: 공개 설정 조회와 코드 확인이다. 실제로 계정을 만들어 침투 시험을 하지는 않았다.
  2026-11-18 재조회에서도 `disable_signup: false`(아직 열려 있음).

### S2. 관리자 API 두 개를 본사관리자 전용으로 — 수정 완료, 로그인 음성 시험 대기

- `src/app/api/admin/remote-access/route.ts`, `src/app/api/admin/store-policy/route.ts` 가
  `requireAdminUser()`(로그인 여부만)를 썼다. 9월에 `getAdminContext()` 를 역할 기반으로 바꿨지만
  이 두 곳은 빠졌다.
- **범위 한정:** `src/app/api/admin/` 아래 API 8개를 전수 조사했고, 구멍은 이 두 개였다(나머지 6개는
  역할 검사). **그 밖의 API 계열은 이번에 감사하지 않았다**: agent, store-controller, pc-setup, kiosk,
  member, cron, automation. 각자 토큰 인증을 쓰지만, "서비스 전체에 구멍이 두 곳뿐"이라고 말할 수
  없다. 전환 전에 같은 방식으로 감사한다.
- 위험이었던 것: 로그인만 하면 전 매장 PC 의 AnyDesk ID 조회, PC 등록 창구 열기, 수동 등록,
  요금표(store_settings) 변경.
- 수정(커밋 `4ee3b8b`): 두 API 를 `getOptionalAdminContext()` + `isHeadAdmin` 으로 막았다. 호출 화면은
  모두 본사 메뉴다(타석관리·원격접속·요금설정). 매장관리자 메뉴는 대시보드·무인제어뿐이다(확인함).
  요금정책의 시흥 고정 매장 ID 는 **그대로 뒀다.** 선택 매장 기준으로 바꾸면 요금설정 화면이 고치는
  대상이 달라지므로 별도 결정 사항이다.
- 회귀 방지: `scripts/check-admin-api-guards.mjs` — `/api/admin/**` 가 `requireAdminUser` 를 쓰거나
  역할 검사가 없으면 실패한다. 수정 전 코드에 돌리면 실패하는 것을 확인했다.
- 검증: 커밋된 코드만 있는 별도 작업 폴더에서 typecheck·대상 eslint·서버 테스트 27개·
  `scripts/check-*.mjs`·운영 빌드(52페이지) 통과. `check-store-observation-policy.mjs` 는
  **수정 전 운영 커밋(`936fe00`)에서도 실패하는 기존 문제**라 이번 변경과 무관하다.
- 통과 기준(로그인 음성 시험): 역할 없는 계정 **401**, 매장관리자 계정 **403**, 본사관리자 200.
  역할 없는 계정은 관리자가 아니므로 401 로 둔다.
- 반영 위치: Vercel 은 push 로 배포. **Oracle 시험 서버는 아직 `936fe00` 이다.** 앞문 인증을 걷어내기
  전에 이 수정 커밋으로 다시 빌드해야 한다(Codex 담당).

### S3. 새 프로젝트의 RLS 정책 점검 (읽기 전용, S1 과 같은 급)

- 매장·타석·회원관리 화면은 서버를 거치지 않고 **브라우저에서 DB 에 직접** 쓴다. 이 경로를 막는 것은
  RLS 정책뿐이라, S2 를 고쳐도 남는다.
- 공개 가입이 열려 있었으므로, 로그인 사용자(`authenticated`)가 Supabase REST 로 직접 표를 읽거나
  쓸 수 있는지 확인한다. `schema.sql` 의 정책이 새 프로젝트에 그대로 있는지가 관건.
- 담당: **Codex 또는 사용자**(Supabase 대시보드). 이 PC 는 로컬 접속 정보가 옛 프로젝트라 관리자
  권한으로 조회할 수 없다.

**익명 수준 결과 (2026-11-18, 공개 anon 키로 읽기만, 행 내용 미출력)**

| 표 | 익명 결과 | 판단 |
| --- | --- | --- |
| `stores`(5), `bays`(21), `reservations` 의 `id`(11) | 읽힘 | 고객 예약 화면이 매장·예약 가능 시간을 보여 주는 설계로 보인다. 예약 표에서 익명이 고를 수 있는 열의 범위는 확인 필요 |
| `reservations` 의 `guest_name`, `guest_phone_last4` | 거부(42501) | 개인정보 열 보호됨 |
| `members`, `store_controller_tokens`, `agent_round_events` | 거부(42501) | 보호됨 |
| `bay_pc_registry`(AnyDesk·토큰 해시), `agent_devices`(토큰 해시), `users`, `store_users`, `access_sessions`, `kiosk_sessions`, `store_controller_commands`, `extension_requests`, `bay_pc_anydesk_history`, `store_settings` | 200 이지만 0행 | RLS 가 익명에게 모두 거른다. `bay_pc_registry` 는 행이 분명히 있으므로 실제로 막힌 것 |

**로그인 계정 수준은 확인하지 못했다.** 계정을 만들어 시험하지 않는다. 대신 Supabase SQL Editor 에서
아래 **읽기 전용** 조회를 돌려 결과를 원장에 남긴다.

```sql
-- 1) RLS 가 꺼진 public 표 (없어야 정상)
select c.relname as table_name
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
order by 1;

-- 2) 로그인 사용자(authenticated) 또는 전체(public)에 적용되는 정책
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and ('authenticated' = any(roles) or 'public' = any(roles))
order by tablename, cmd;
```

`qual` 이 `true` 이거나 역할·매장 검사가 없는 정책, 특히 쓰기(`INSERT`/`UPDATE`/`DELETE`/`ALL`)가
있으면 위험하다.

### S4. 시흥 매장 제어기 복구는 지금 진행 (전환을 기다리지 않는다)

- 미니 PC 교체로 제어기가 빠졌다. 지금은 운영 주소(`vercel.app`)로 설치한다.
- 설치 때 옛 노트북에서 회수하는 제어기 토큰이 곧 Vercel 의 마스킹된 `STORE_CONTROLLER_TOKEN` 이다.
  5절의 회수 항목 하나가 여기서 해결된다(값은 원장·채팅에 적지 않는다).

---

## 3. 출처에서 확인해야 할 외부 사실

계획의 전제가 되지만, 여기서 단정하지 않는다.

| 질문 | 왜 중요한가 | 확인할 곳 |
| --- | --- | --- |
| Always Free 인스턴스가 한가하면 회수되는가? 유료 계정(Pay As You Go)으로 바꾸면 회수 대상에서 빠지는가? | 트래픽이 적은 서비스라 "한가함"으로 판정될 수 있다 | Oracle Always Free 문서의 idle compute 항목 https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm |
| 고정(reserved) 공인 IP 를 무료 한도 안에서 쓸 수 있는가? | 임시 IP 는 정지/재시작 때 바뀔 수 있다 | 같은 문서 및 OCI 네트워킹 문서 |
| Vercel Pro 해지 후 `vercel.app` 주소는 어떻게 되는가? Hobby 의 상업적 사용 제한은? | 옛 주소로 들어오는 고객을 안내 페이지로 넘길 수 있는지 | https://vercel.com/docs/plans/hobby , https://vercel.com/docs/limits/fair-use-guidelines |
| Vercel Pro 실제 청구액 | 절감액 판단 | Vercel 결제 화면 |

---

## 4. 단계별 계획

각 단계는 담당, 필요한 승인, 통과 기준, 되돌리기를 가진다.

### P0. 보안 (2절 S1~S3) — 지금

- 담당: S1 사용자, S2 Claude/Codex(코드) + 사용자 승인(배포), S3 Codex 또는 사용자(읽기, S1 과 같은 급)
- 통과: 공개 가입 꺼짐, S2 음성 시험 통과, RLS 점검 결과 원장 기록
- 되돌리기: S2 는 이전 커밋으로 재배포

### P1. 소유 도메인 확보 + Vercel 에 연결

- 담당: 사용자(구입), Claude/Codex(설정 안내)
- 할 일
  - 안정적인 주소 정하기. **새 도메인 구입이 필수는 아니다.** 이미 가진 도메인이 있으면 그 하위 주소
    (예: `vista.보유도메인.kr`)를 써도 된다. 조건은 우리가 DNS 를 관리할 수 있고 오래 유지할 주소일 것.
    관리자·키오스크·API 를 한 주소 또는 하위 주소로 나눈다(예: `app.` 운영, `oracle.` 시험).
  - Vercel 프로젝트에 도메인 연결(아직 Vercel 이 응답한다).
  - Supabase Auth 의 Site URL 과 Redirect URLs 에 새 도메인 추가(카카오 로그인 콜백
    `window.location.origin` 기반).
  - DNS TTL 을 300초로 둔다.
- 통과: 새 도메인으로 관리자 로그인·키오스크·Agent API 가 Vercel 에서 정상 응답
- 되돌리기: 아무것도 안 바뀐다(옛 주소도 계속 동작)

### P2. Oracle 운영 준비 (P1 과 병행)

- 담당: Codex(서버), Claude(코드: 헬스체크·배포 스크립트·S2), 사용자(승인·비밀값 회수)
- 할 일
  - 고정 IP, 자동 보안 업데이트, journald 용량 제한
  - 재시작·복구 정책: `Restart=always` 만으로는 부족하다(시작 횟수 제한이 그대로 걸린다). 제한값,
    제한에 걸렸을 때의 `OnFailure=` 알림, 그 뒤의 복구 방법을 한 묶음으로 정한다(1절 표)
  - 헬스체크 두 단계: 가벼운 생존 확인(DB 미사용)을 외부 가동 감시(무료 서비스)가 자주 부르고,
    DB 연결 확인은 낮은 빈도로만. 감시 때문에 Supabase 호출이 늘지 않게 한다
  - 배포 스크립트: 서버가 공개 GitHub 에서 지정 커밋을 받아 빌드(인바운드 SSH 를 넓히지 않음),
    링크 전환, 재시작, 헬스체크 실패 시 이전 릴리스로 자동 복귀
  - 비밀값·플래그를 Vercel 과 동일하게(5절). `STORE_CONTROLLER_ENABLED=true`
  - 계정 회수 정책 확인(3절) 후 필요하면 Pay As You Go 전환 검토
- 통과: 배포 → 재시작 → 되돌리기를 한 번씩 실제로 해 봄. 서버 재부팅 후 자동 복구. 알림 수신 확인
- 되돌리기: 운영 트래픽이 아직 없으므로 영향 없음

### P3. 모든 사용처를 새 도메인으로 (아직 Vercel 이 응답)

- 담당: 사용자(현장), Codex/Claude(패키지·안내)
- 6절 표의 사용처를 하나씩 옮긴다. 이 단계는 Vercel 뒤에서 하므로 **실패해도 서비스가 멈추지 않는다.**
- "아직 옛 주소를 쓰는 곳"을 볼 수 있어야 한다. Agent·제어기 요청의 Host 를 기록하는 작은 변경을
  넣거나, Vercel 로그를 Host 로 걸러 본다.
- 통과: 정해진 관찰 기간 동안 옛 주소로 들어오는 현장 요청 0
- 되돌리기: 해당 장비 설정만 옛 주소로

### P4. Oracle 검증 (시험 하위 주소에서)

- 담당: Codex/Claude, 사용자(승인)
- 순서
  1. P0 의 S2 가 Oracle 빌드에도 들어간 것을 확인
  2. 음성 시험: 역할 없는 계정·매장관리자의 타 매장 접근 거부
  3. **그다음에만** 앞문 인증(basicauth) 제거
  4. E2E: 관리자 로그인(PC·모바일망), 매장 전환, 키오스크 흐름(시험 데이터 `[TEST]`)
  5. 카나리: 시험용 Agent 1대, 시험용 제어기 1개를 시험 하위 주소로. 명령 중복 방지, 폐기된 토큰
     거부, 정상 종료 수신 확인. 실제 전원 명령은 그때그때 승인
- 통과: 위 전부 기록
- 되돌리기: 시험 장비를 운영 주소로

### P5. DNS 전환

- 담당: 사용자(승인), Codex/Claude(실행·감시)
- 전날: TTL 300 확인, 배포 동결, 두 서버 비밀값·플래그 최종 대조
- 전환: 운영 도메인 A 레코드를 Oracle 고정 IP 로. Caddy 가 인증서 발급
- **인증서 공백 주의:** 보통 방식(HTTP 확인)으로는 DNS 가 Oracle 을 가리킨 뒤에야 인증서가 나온다.
  그 사이 Agent·제어기의 HTTPS 연결이 실패한다. 둘 중 하나로 대비한다.
  - DNS 확인 방식으로 인증서를 **미리** 발급해 둔다(도메인 업체 API 필요).
  - 또는 "전환 후 5분 안에 인증서가 발급되지 않으면 즉시 DNS 를 되돌린다"는 기준을 정해 둔다.
- 감시(전환 후 30분): 매장별 Agent heartbeat 가 2분 안에 들어오는지, 제어기 조회, 키오스크, 관리자 로그인
- **두 서버로 나뉘는 기간이 생긴다.** DNS 캐시(공유기, Windows, 통신사) 때문에 전환 후에도, 되돌린
  뒤에도 한동안 일부 장비는 옛 서버로, 일부는 새 서버로 붙는다. TTL 을 낮춰도 0 이 되지는 않는다.
  그래서 전환 전에 확인한다.
  - 두 서버가 **같은 커밋**을 돌린다(버전 호환). 전환 기간에는 양쪽 다 배포를 멈춘다.
  - 같은 명령이 두 서버를 거쳐 두 번 실행되지 않는다. 제어기·Agent 명령은 DB 조건부 갱신(선점)과
    유효시간으로 중복을 막는다. 두 서버가 동시에 받는 상황으로 카나리에서 시험한다.
  - 프로세스 메모리 기반 간격 제한(`poll-maintenance.ts`)은 서버마다 따로 돈다. 정리 작업이 잠시
    두 번 돌 수 있으나 DB 조건부 갱신이 실제 중복을 막는다.
  - 비밀값·플래그가 양쪽에서 같다(한쪽만 다르면 일부 장비만 401).
- 되돌리기: A 레코드를 Vercel 로. 데이터는 같은 DB 라 정리할 것이 없지만, **즉시 복구는 아니다.**
  캐시가 만료될 때까지 위의 "나뉘는 기간"이 다시 생긴다. 양쪽 서버를 그 동안 모두 켜 둔다.
- 손님이 적은 시간에 한다

### P6. 관찰 후 Vercel 해지

- 1~2주 Vercel 을 대기 상태로 둔다(한 달 요금을 더 내는 보험)
- 옛 `vercel.app` 주소 접근이 0 인지 확인. 고객 북마크·QR 은 안내 방식 결정(3절 확인 후)
- 사용자 승인 후 Pro 해지

---

## 5. 비밀값·설정 목록 (회수 또는 재발급)

코드가 실제로 읽는 환경변수(`src/` 전수 조사)다. 값은 어디에도 적지 않는다.

| 이름 | 상태/쓰임 | 결정 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 공개값. Oracle 반영됨 | 완료. 빌드 시점에 박히므로 바뀌면 재빌드 |
| `SUPABASE_SERVICE_ROLE_KEY` | Oracle 반영됨 | 완료 |
| `STORE_CONTROLLER_ENABLED` | 플래그. 시험 서버는 false | 전환 시 true |
| `STORE_CONTROLLER_TOKEN` | 전역 제어기 토큰. Vercel 에서 마스킹 | 시흥 옛 노트북에서 회수(S4). 권장: 시흥도 매장별 토큰으로 바꾸고 전역 토큰 폐지 |
| `PC_SETUP_TOKEN` | 세팅 도구 복구용 전역 토큰. 마스킹 | 재발급(세팅 도구는 입력받는 방식이라 하드코딩 없음) |
| `KIOSK_ACCESS_KEY` | 키오스크 URL `?key=` | 태블릿 URL 에서 회수, 또는 재발급 후 태블릿 주소 교체 |
| `CRON_SECRET` | `/api/cron/close-expired-sessions`. 로컬 값은 운영과 다름 | 호출자(시흥 HA `vista_scheduler.yaml`) 사용 여부 확인 → 쓰면 재발급, 안 쓰면 폐지 |
| `IOT_WEBHOOK_SECRET`, `DEVICE_WEBHOOK_URL`, `HOME_ASSISTANT_URL`, `HOME_ASSISTANT_TOKEN`, `HOME_ASSISTANT_TIMEOUT_MS` | 서버가 HA 를 직접 부르던 옛 경로(제어기로 대체됨) | 아직 쓰는 경로가 있는지 확인 → 없으면 폐지, 있으면 회수 |

---

## 6. 주소 사용처 목록

| 사용처 | 주소가 들어 있는 곳 | 바꾸는 방법 | 비고 |
| --- | --- | --- | --- |
| 시흥 Agent 3대 | exe 내장 `bays.config.json` 의 `shared.apiBaseUrl` | 로컬 설정에 `shared.apiBaseUrl` 덮어쓰기, 또는 새 빌드 재설치 | 0.6.0 구버전 PC 는 재설치 권장 |
| 송도 Agent 9대 | 내장값(USB 설치는 사용자 폴더, 세팅 도구 설치는 ProgramData) | 같은 위치에 `shared.apiBaseUrl` 추가 | Agent 의 병합 코드가 로컬 `shared` 로 덮어쓴다(확인함) |
| 삼송 Agent 8대 | 아직 미설치 | **처음부터 새 도메인 기본값의 빌드로 설치** | 설치 일정이 전환보다 빠르면 기본값만 바꿔 빌드 |
| 매장 제어기(시흥·송도) | `C:\VISTA\store-controller\controller.config.json` 의 `apiBaseUrl` | 파일 한 줄 수정 후 작업 재시작 | 설치 도우미에 `-ApiBaseUrl` 인자 있음 |
| 송도 HA 예약 종료 연결 | HA REST 설정(저장소 밖) | HA 설정에서 URL 교체 | 매장 토큰 인증 |
| 시흥 HA 스케줄러 | `homeassistant/packages/vista_scheduler.yaml` | 사용 중이면 URL 교체 | 실제 설치 여부 확인 |
| PC 세팅 도구 | `tools/HH_Golf_PC_Setup_v3/HH_Setup.ps1` 기본 주소 + 배포된 ZIP | 기본값 교체 후 새 ZIP 배포 | |
| 키오스크 태블릿 | `/kiosk/entrance?key=…` 북마크 | 태블릿에서 주소 교체 | |
| 관리자 PWA·북마크 | 각 기기 | 새 주소로 재설치 | |
| 회원 예약 링크·QR·설치 PWA | 인쇄물, 안내 문자, 고객 폰 | **사용자 확인 필요** | 인쇄물이 있으면 옛 주소 안내 방식이 중요 |
| Supabase Auth | Site URL / Redirect URLs | 새 도메인 추가 | P1 |

**Agent 주소를 손으로 덮어쓰는 방식의 함정:** PC 세팅 도구로 다시 설치하면 서버가 만든 설정 파일이
ProgramData 에 덮어써져, 손으로 넣은 `shared.apiBaseUrl` 이 사라진다. 그래서 오래 갈 경로는 둘 중
하나다.

- 새 Agent 빌드의 내장 기본값(`bays.config.json` 의 `shared.apiBaseUrl`)을 새 도메인으로 바꾼다.
- 서버가 만드는 설치 파일(`src/lib/agent-bay-config.ts`)에 `shared.apiBaseUrl` 을 넣는다.

손으로 덮어쓰기는 재설치 전까지 쓰는 임시 방편으로만 쓴다.

**Agent 버전 현황은 이 PC 에서 조회할 수 없다**(로컬 접속 정보가 옛 프로젝트). Codex 또는 사용자가
매장별 Agent 버전·설치 경로(사용자 폴더/ProgramData)를 표로 만들어야 P3 방법이 정해진다.

---

## 7. 결정이 필요한 것

1. **어떤 안정적인 주소를 쓸 것인가?** 새 도메인을 사거나, 이미 가진 도메인의 하위 주소를 쓴다.
   어느 쪽이든 우리가 DNS 를 관리하는 오래 갈 주소여야 한다. 임시 주소로 먼저 옮기면 현장 장비를
   두 번 옮겨야 한다.
2. **고객과 키오스크가 `vercel.app` 을 쓰는 곳**: 인쇄된 QR, 안내 문자, 키오스크 태블릿, 고객이 설치한
   앱(PWA)이 있는가?
3. S1 공개 가입 차단(사용자가 대시보드에서), S3 로그인 수준 RLS 조회 실행(사용자 또는 Codex).
4. S2 로그인 음성 시험: 매장관리자 계정으로 원격접속 API 가 막히는지, 본사 계정으로 세 화면이
   그대로 열리는지 확인.

## 8. 하지 말 것

- **별도 승인 없이 하지 않는다: 계정 삭제, 비밀값 재발급, 운영 전환(DNS 변경·현장 주소 변경·Vercel 해지).**
- 앞문 인증을 S2 음성 시험 전에 걷어내지 말 것.
- 현장 Agent·제어기를 임시 `sslip.io` 주소로 옮기지 말 것(IP 가 임시이고 앞문 인증이 막는다).
- 두 서버를 계획 없이 동시에 "운영"으로 두지 말 것. DNS 는 한쪽만 가리키게 하되, 캐시 때문에
  전환·되돌리기 직후에는 양쪽으로 나뉘므로 그 기간은 P5 의 확인 항목(같은 커밋, 배포 동결, 중복 방지,
  비밀값 동일)을 지킨 채 둘 다 켜 둔다.
- 로컬 `.env.local`(삭제된 옛 프로젝트)을 어떤 빌드에도 쓰지 말 것.
