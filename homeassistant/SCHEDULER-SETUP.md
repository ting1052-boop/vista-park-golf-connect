# VISTA 자동 운영 스케줄러 설정

Vercel Hobby 요금제는 5분 주기 Cron을 지원하지 않습니다. 대신 매장에 상시 실행되는 Home Assistant가 아래 두 API를 5분마다 호출합니다.

- 만료 세션 종료 및 타석 자동 반납
- 예약 시작 5분 전 장비 준비

## 1. 비밀값 등록

Home Assistant의 `/config/secrets.yaml` 파일에 아래 한 줄을 추가합니다. `여기에_CRON_SECRET` 부분은 Vercel의 `CRON_SECRET`과 정확히 같은 값으로 바꿉니다.

```yaml
vista_cron_authorization: "Bearer 여기에_CRON_SECRET"
```

실제 비밀값은 GitHub나 채팅에 올리지 않습니다.

## 2. 패키지 파일 복사

이 저장소의 `homeassistant/packages/vista_scheduler.yaml`을 Home Assistant의 `/config/packages/vista_scheduler.yaml`로 복사합니다.

## 3. 패키지 사용 설정

Home Assistant의 `/config/configuration.yaml`에서 `homeassistant:` 항목을 찾습니다. 없으면 아래 내용을 추가합니다.

```yaml
homeassistant:
  packages: !include_dir_named packages
```

이미 `homeassistant:` 항목이 있으면 그 아래에 `packages:` 한 줄만 들여쓰기를 맞춰 추가합니다. `homeassistant:` 항목을 두 번 만들면 안 됩니다.

## 4. 검사와 재시작

Home Assistant에서 `설정 > 시스템 > 구성 검사`를 실행합니다. 오류가 없으면 Home Assistant를 재시작합니다.

재시작 후 `설정 > 자동화 및 장면 > 자동화`에서 다음 두 항목이 보이면 정상입니다.

- VISTA 만료 타석 자동 반납
- VISTA 예약 5분 전 매장 준비

각 자동화의 `실행` 버튼을 한 번 누른 뒤 추적 기록에 오류가 없는지 확인합니다.
