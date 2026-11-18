// 회원 예약 화면의 "예약 가능 시간" 계산용 공용 로직.
// 서버 API(/api/member/availability)와 화면이 함께 쓰며, node --test 로 검사한다
// (그래서 @/ 별칭 없이 상대경로 + .ts 확장자로만 가져온다).
import { SONGDO_STORE_ID } from "./automation/device-map.ts";

export const INACTIVE_RESERVATION_STATUSES = ["cancelled", "no_show", "completed"];

// 관리자 예약 화면과 같은 기준: 송도는 VISTA 예약을 쓰지 않는다.
const RESERVATION_DISABLED_STORE_IDS = new Set([SONGDO_STORE_ID]);

// 화면은 오늘~모레(+2시간)만 조회한다. 여유를 두되 넓은 범위 덤프는 막는다.
export const MAX_RANGE_MS = 4 * 24 * 60 * 60 * 1000;
export const PAGE_SIZE = 500;
// 이 이상이면 잘린 목록을 주지 않고 실패로 돌려준다. 매장 하나·4일 기준으로 넉넉한 값.
export const MAX_ROWS = 5000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AvailabilityRow = {
  bay_id: string | null;
  starts_at: string;
  ends_at: string;
  status: string | null;
};

export function isPublicReservationStore(store: { id: string; status: string | null } | null | undefined) {
  return Boolean(store && store.status === "active" && !RESERVATION_DISABLED_STORE_IDS.has(store.id));
}

export function parseAvailabilityQuery(params: URLSearchParams):
  | { storeId: string; from: Date; to: Date }
  | { error: string } {
  const storeId = params.get("storeId") ?? "";
  const fromText = params.get("from");
  const toText = params.get("to");

  if (!UUID.test(storeId)) return { error: "매장을 확인해주세요." };
  if (!fromText || !toText) return { error: "조회 기간을 확인해주세요." };

  const from = new Date(fromText);
  const to = new Date(toText);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return { error: "조회 기간을 확인해주세요." };
  if (to <= from) return { error: "조회 기간을 확인해주세요." };
  if (to.getTime() - from.getTime() > MAX_RANGE_MS) return { error: "조회 기간이 너무 깁니다." };

  return { storeId, from, to };
}

// 개인정보 열이 select 에 섞여 들어와도 응답에는 이 네 칸만 나간다.
export function toAvailabilityRows(rows: ReadonlyArray<Record<string, unknown>>): AvailabilityRow[] {
  return rows.map((row) => ({
    bay_id: typeof row.bay_id === "string" ? row.bay_id : null,
    starts_at: String(row.starts_at),
    ends_at: String(row.ends_at),
    status: typeof row.status === "string" ? row.status : null
  }));
}

type PageResult<T> = { data: T[] | null; error: { message: string } | null; count: number | null };

/**
 * 모든 행을 끝까지 읽는다. DB 쪽 최대 행 수 설정이 요청한 쪽수보다 작아도
 * 전체 개수(count)와 맞을 때까지 이어서 읽으므로 조용히 잘리지 않는다.
 * 개수를 모르거나, 중간에 비거나, 상한을 넘으면 실패로 돌려준다(빈 목록 취급 금지).
 */
export async function collectAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  { pageSize = PAGE_SIZE, maxRows = MAX_ROWS } = {}
): Promise<{ rows: T[] } | { error: string }> {
  const rows: T[] = [];

  for (;;) {
    const page = await fetchPage(rows.length, rows.length + pageSize - 1);
    if (page.error) return { error: page.error.message };
    if (typeof page.count !== "number") return { error: "예약 현황 개수를 확인하지 못했습니다." };
    if (page.count > maxRows) return { error: "예약 현황이 너무 많아 조회하지 못했습니다." };

    rows.push(...(page.data ?? []));
    if (rows.length >= page.count) return { rows };
    if (!page.data || page.data.length === 0) return { error: "예약 현황을 끝까지 읽지 못했습니다." };
  }
}

// 화면: API 응답을 검사한다. 실패·형식 이상은 예외로 올려, 빈 목록(=모두 예약 가능)으로 보이지 않게 한다.
export function readAvailabilityPayload(responseOk: boolean, payload: unknown): AvailabilityRow[] {
  const body = payload as { ok?: unknown; complete?: unknown; reservations?: unknown; message?: unknown } | null;
  if (!responseOk || !body || body.ok !== true || body.complete !== true || !Array.isArray(body.reservations)) {
    throw new Error(typeof body?.message === "string" ? body.message : "예약 현황을 불러오지 못했습니다.");
  }

  for (const row of body.reservations as Array<Record<string, unknown>>) {
    if (!row || typeof row.starts_at !== "string" || typeof row.ends_at !== "string") {
      throw new Error("예약 현황 형식이 올바르지 않습니다.");
    }
  }

  return body.reservations as AvailabilityRow[];
}

// 화면: 지금 선택한 매장의 현황이 아니면(전환 직후·실패) null → 예약 가능 0 으로 처리한다.
export function availabilityForStore(
  loaded: { storeId: string; rows: AvailabilityRow[] } | null,
  storeId: string
): AvailabilityRow[] | null {
  return loaded && loaded.storeId === storeId ? loaded.rows : null;
}

export function getBlockedBayIds(rows: ReadonlyArray<AvailabilityRow>, startsAt: Date, endsAt: Date) {
  const blocked = new Set<string>();
  const start = startsAt.getTime();
  const end = endsAt.getTime();

  for (const row of rows) {
    if (!row.bay_id || INACTIVE_RESERVATION_STATUSES.includes(row.status ?? "")) continue;
    if (start < new Date(row.ends_at).getTime() && new Date(row.starts_at).getTime() < end) blocked.add(row.bay_id);
  }

  return blocked;
}
