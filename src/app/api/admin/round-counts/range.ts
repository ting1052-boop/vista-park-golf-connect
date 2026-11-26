// agent_round_daily_counts 는 범위가 뒤집혔거나 92일을 넘으면 조용히 0행을 돌려준다.
// 그러면 리포트가 "게임 없음"처럼 보이므로 여기서 먼저 거절한다.
const MAX_SPAN_DAYS = 92;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function dayNumber(value: string) {
  if (!DATE.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? ms / 86_400_000 : null;
}

export function parseRoundCountRange(params: URLSearchParams, defaultFrom: string, defaultTo: string) {
  const from = params.get("from") || defaultFrom;
  const to = params.get("to") || defaultTo;
  const fromDay = dayNumber(from);
  const toDay = dayNumber(to);
  if (fromDay === null || toDay === null) return { error: "날짜는 YYYY-MM-DD 형식이어야 합니다." } as const;
  if (fromDay > toDay) return { error: "시작일이 종료일보다 늦습니다." } as const;
  if (toDay - fromDay > MAX_SPAN_DAYS) return { error: `한 번에 ${MAX_SPAN_DAYS + 1}일까지 조회할 수 있습니다.` } as const;
  return { from, to } as const;
}
