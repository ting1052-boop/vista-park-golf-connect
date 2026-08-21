// 이용시간·요금 정책의 단일 출처.
// 고객 예약 화면과 입구 키오스크가 같은 값을 쓰도록 여기서만 정의한다.
// (매장별 요금이 필요해지면 이 모듈을 DB 조회로 교체한다 — 2차 항목)

export const durationOptions = [
  { minutes: 30, price: 6000, bonusMinutes: 0 },
  { minutes: 60, price: 10000, bonusMinutes: 10 },
  { minutes: 90, price: 16000, bonusMinutes: 15 },
  { minutes: 120, price: 20000, bonusMinutes: 20 }
] as const;

export type DurationOption = (typeof durationOptions)[number];

export const priceByDuration = Object.fromEntries(durationOptions.map((option) => [option.minutes, option.price])) as Record<
  number,
  number
>;

export const bonusMinutesByDuration = Object.fromEntries(
  durationOptions.map((option) => [option.minutes, option.bonusMinutes])
) as Record<number, number>;

export function isSupportedDuration(minutes: number): boolean {
  return durationOptions.some((option) => option.minutes === minutes);
}

// 고객 예약·키오스크는 위 이용시간표만 쓴다. 관리자 수동 입장은 단체 손님처럼
// 예외 상황을 처리해야 하므로 1~8시간을 1시간 단위로 허용한다.
export const ADMIN_MIN_HOURS = 1;
export const ADMIN_MAX_HOURS = 8;

export function isSupportedAdminDuration(minutes: number): boolean {
  if (isSupportedDuration(minutes)) return true;
  if (!Number.isInteger(minutes) || minutes % 60 !== 0) return false;

  return minutes >= ADMIN_MIN_HOURS * 60 && minutes <= ADMIN_MAX_HOURS * 60;
}

// 이용시간표에 없는 시간(관리자가 지정한 3시간 등)은 시간 비례로 계산한다.
// 아래 기준값은 표의 60분·120분과 정확히 같아 기존 요금 체계와 어긋나지 않는다.
const HOURLY_PRICE = 10000;
const HOURLY_BONUS_MINUTES = 10;

export function getPriceForDuration(durationMinutes: number): number {
  const listed = priceByDuration[durationMinutes];
  if (listed !== undefined) return listed;

  return Math.round((durationMinutes / 60) * HOURLY_PRICE);
}

export function getBonusMinutesForDuration(durationMinutes: number): number {
  const listed = bonusMinutesByDuration[durationMinutes];
  if (listed !== undefined) return listed;

  return Math.round((durationMinutes / 60) * HOURLY_BONUS_MINUTES);
}

// 실제 타석을 점유하는 시간.
// 60분부터는 서비스 시간이 붙어 60분=70분, 90분=105분, 120분=140분을 차단한다.
export function getBlockMinutes(durationMinutes: number): number {
  return durationMinutes + getBonusMinutesForDuration(durationMinutes);
}

export function getDurationLabel(durationMinutes: number): string {
  const bonus = bonusMinutesByDuration[durationMinutes] ?? 0;
  return bonus > 0 ? `${durationMinutes}분 + ${bonus}분` : `${durationMinutes}분`;
}

// 90분 이상 또는 5명 이상은 매장 승인 후 확정
export function isApprovalRequired(durationMinutes: number, partySize: number): boolean {
  return durationMinutes > 60 || partySize >= 5;
}
