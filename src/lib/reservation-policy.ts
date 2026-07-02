// 이용시간·요금 정책의 단일 출처.
// 고객 예약 화면과 입구 키오스크가 같은 값을 쓰도록 여기서만 정의한다.
// (매장별 요금이 필요해지면 이 모듈을 DB 조회로 교체한다 — 2차 항목)

export const durationOptions = [
  { minutes: 30, price: 6000, bonusMinutes: 0 },
  { minutes: 60, price: 10000, bonusMinutes: 10 },
  { minutes: 90, price: 16000, bonusMinutes: 0 },
  { minutes: 120, price: 20000, bonusMinutes: 0 }
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

// 실제 타석을 점유하는 시간 (60분 예약은 서비스 10분을 더해 70분 차단)
export function getBlockMinutes(durationMinutes: number): number {
  return durationMinutes + (bonusMinutesByDuration[durationMinutes] ?? 0);
}

export function getDurationLabel(durationMinutes: number): string {
  const bonus = bonusMinutesByDuration[durationMinutes] ?? 0;
  return bonus > 0 ? `${durationMinutes}분 + ${bonus}분` : `${durationMinutes}분`;
}

// 90분 이상 또는 5명 이상은 매장 승인 후 확정
export function isApprovalRequired(durationMinutes: number, partySize: number): boolean {
  return durationMinutes > 60 || partySize >= 5;
}
