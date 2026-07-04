# VISTA 전체 시스템 점검 체크리스트 (위임용)

작성일: 2026-07-04 · 용도: codex/opus/sonnet에게 검증 작업을 맡길 때 이 문서를 그대로 전달

## 0. 현재 상태 스냅샷 (2026-07-04 기준)

### 완료·검증됨 ✅
- 고객 예약 화면(/member/app): 이중예약 방지(앱+DB 배타제약), E2E 검증 완료
- 입구 키오스크(/kiosk/entrance): 예약 입장 + 현장 이용(타석 그리드 선택, 후불 계좌이체), E2E 검증 완료
- 관리자 인증: middleware + 로그인, 미인증 리다이렉트 검증 완료
- RLS: 202607010003 적용됨 (anon으로 memo 조회 시 42501 확인됨)
- 미수금 화면(/admin/unpaid): 데이터 레벨 검증 완료
- Windows Agent: exe 빌드 + 타석 선택 + 로컬 세션 오버레이 동작 확인 (이 PC에서)
- Agent 서버 API: /api/agent/session, /api/agent/extension-request, /api/agent/heartbeat 구현 완료
- HA ↔ VISTA: ping 성공, script.bay1_on/bay2_on으로 실제 PC 부팅 성공
- .env.local: HOME_ASSISTANT_URL(192.168.0.44:8123), TOKEN, IOT_WEBHOOK_SECRET, KIOSK_ACCESS_KEY, SERVICE_ROLE_KEY 설정됨

### 미완·리스크 ⚠️
- 헤이홈(조명/IR): Smart Life 이사 실패 → Open API + HA rest_command 방식으로 전환 결정
- HA 스크립트 부족: shared_on/off, bay3_on, bay1~3_off 없음. bay1_on에 TV/리시버/프로젝터 미포함
- Agent 서버 모드 실기기 미검증: agent_devices 토큰 등록 후 타석 PC에서 server 모드 전환 필요
- Vercel 프로덕션: HOME_ASSISTANT_* / IOT_WEBHOOK_SECRET / KIOSK_ACCESS_KEY / SERVICE_ROLE_KEY가 Vercel 환경변수에 들어갔는지 미확인
- Vercel → 매장 HA 접근 불가 (외부 노출 필요: Cloudflare Tunnel 또는 Nabu Casa) — 프로덕션 자동화의 전제조건
- Vercel Attack Challenge Mode 켜져 있음(403/challenge) → Agent·서버간 API 호출 차단 가능성
- reservation-prepare(예약 5분 전 자동 준비) 크론 스케줄러 없음 (vercel.json cron 제거된 상태)
- 요금/영업시간 하드코딩, 계좌번호 코드 내 상수, .env.local에 SUPABASE_SERVICE_ROLE_KEY 빈 줄 중복

---

## 1. 웹앱 기본 (로컬)

```bash
cd C:\Users\ting\Documents\Vista_m
npm run typecheck   # 통과해야 함
npm run lint        # 통과해야 함
npm run build       # 28+ 라우트 빌드 성공해야 함 (dev 서버 켜진 채 실행 금지!)
```
⚠️ 주의: dev 서버 실행 중 build 금지 (.next 캐시 깨짐 전례 2회). build 전 dev 종료.

## 2. DB / RLS (test-scenarios.md 6절 미완 항목)

anon 키로 아래를 시도해 전부 거부되는지 확인:
```bash
ANON=$(grep "^NEXT_PUBLIC_SUPABASE_ANON_KEY=" .env.local | cut -d= -f2- | tr -d '\r')
BASE=https://bueabyhszssqvlkmjkhd.supabase.co/rest/v1

# 6-1 anon DELETE → 거부(401/403/42501)여야 함
curl -s -w "\n%{http_code}\n" -X DELETE "$BASE/reservations?id=eq.00000000-0000-0000-0000-000000000000" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
# 6-3 anon guest_name SELECT → permission denied여야 함
curl -s "$BASE/reservations?select=guest_name&limit=1" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
# 6-4 anon 가용성 컬럼 SELECT → 200 허용이어야 함
curl -s "$BASE/reservations?select=bay_id,starts_at,ends_at,status&limit=1" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
# 6-5 anon channel=admin INSERT → 거부여야 함 (RLS with check)
```
관리자 로그인 후 /admin/stores CRUD 정상 동작 확인 (5-5, 5-6, 6-6).

## 3. 키오스크 (실기기)

- 태블릿 Fully Kiosk에서 `…/kiosk/entrance?key=<KIOSK_ACCESS_KEY>` 최초 1회 접속으로 키 등록
- 예약 흐름: 오늘 예약 생성(회원앱) → 태블릿에서 뒤4자리 입장 → 완료 화면
- 현장 흐름: 시간 선택 → 타석 그리드(빈/이용중 표시) → 후불 안내(카카오뱅크 3333-36-2921743 김흥수 표시) → 이용 시작
- 확인 포인트: 입장 후 automationStatus가 requested인지(HA 연결 시), 예약/세션/타석상태 DB 반영, 테스트 데이터 정리

## 4. Windows Agent (타석 PC 실기기)

- dist의 exe를 타석 PC에 복사 → 첫 실행 타석 선택 → %APPDATA%\VISTA Bay Agent에 설정 저장 확인
- Supabase SQL Editor에서 `supabase/agent-devices-siheung-template.sql`을 실제 토큰으로 수정 후 실행
- Agent 설정은 실행파일에 포함된 `bays.config.json` 기준. 첫 실행 시 타석 번호만 선택
- **핵심 실증: 스크린골프 게임 실행 중 오버레이(미니/경고/잠금)가 게임 위에 보이는지** (독점 전체화면이면 가려짐 → 게임을 borderless로)
- agent-session.json endsAt을 +5분으로 → 경고 팝업 → 잠금 화면 전환 확인
- 서버 모드에서 /api/agent/session 폴링, /api/agent/heartbeat, /api/agent/extension-request 동작 확인

## 5. HA / 장비

```bash
# VISTA → HA 체인 (로컬 dev 서버에서)
SECRET=$(grep "^IOT_WEBHOOK_SECRET=" .env.local | cut -d= -f2- | tr -d '\r')
curl -s -X POST http://localhost:3000/api/automation/test -H "Content-Type: application/json" -H "x-iot-webhook-secret: $SECRET" -d '{"target":"ping"}'
# → {"ok":true,...} 여야 함
```
- HA 스크립트 현황: bay1_on, bay2_on만 존재. 만들 것: bay3_on, shared_on/off, bay1~3_off
- 헤이홈 연동(결정된 방식): goqual.io에서 토큰 발급(180일) → goqual.notion.site API 문서로 기기ID/엔드포인트 확인 → HA configuration.yaml에 rest_command 정의 → 스크립트에서 호출. HACS 컴포넌트 사용하지 않음
- 토큰 만료(180일) 갱신 리마인더를 운영 캘린더에 등록할 것

## 6. 프로덕션 (Vercel)

- [ ] Vercel 환경변수 확인/등록: SUPABASE_SERVICE_ROLE_KEY, KIOSK_ACCESS_KEY, IOT_WEBHOOK_SECRET, (HA 외부노출 후) HOME_ASSISTANT_URL/TOKEN
- [ ] Attack Challenge Mode 확인: Vercel → Settings → Security. Agent/서버간 호출이 challenge에 걸리지 않는지 (curl로 /api/kiosk/bays 호출 시 403 challenge 나오면 문제)
- [ ] Vercel → 매장 HA 접근: Cloudflare Tunnel(무료) 권장. 터널 URL을 HOME_ASSISTANT_URL로
- [ ] reservation-prepare 크론 재설정: vercel.json cron 또는 HA 자동화가 5분마다 프로덕션 API 호출(시크릿 헤더 포함) — 후자가 무료·매장 상주라 권장
- [ ] 배포 후 프로덕션에서 키오스크 E2E 1회

## 7. 운영 안정성 (권장 순서)

1. HA 노트북: 덮개 닫힘/절전 해제, 자동 로그인 + VirtualBox 자동시작, 공유기에서 IP(192.168.0.44) DHCP 예약
2. 중기: 미니PC로 HA 이전 (노트북+VirtualBox가 최대 단일 장애점)
3. 장기: Zigbee USB 동글 + ZHA로 스위치류 로컬화 (클라우드 의존 제거)
