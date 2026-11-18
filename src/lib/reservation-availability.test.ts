import assert from "node:assert/strict";
import test from "node:test";
import { SONGDO_STORE_ID } from "./automation/device-map.ts";
import {
  INACTIVE_RESERVATION_STATUSES,
  MAX_RANGE_MS,
  availabilityForStore,
  collectAllRows,
  getBlockedBayIds,
  isPublicReservationStore,
  parseAvailabilityQuery,
  readAvailabilityPayload,
  toAvailabilityRows,
  type AvailabilityRow
} from "./reservation-availability.ts";

const SIHEUNG = "11111111-1111-4111-8111-111111111111";
const FROM = "2026-11-19T00:00:00.000Z";

function query(values: Record<string, string>) {
  return parseAvailabilityQuery(new URLSearchParams(values));
}

test("입력 검증: 매장·날짜 누락, 잘못된 날짜, 역전, 기간 초과는 거부", () => {
  const to = "2026-11-20T00:00:00.000Z";
  const rejected: Array<Record<string, string>> = [
    {},
    { from: FROM, to },
    { storeId: "not-a-uuid", from: FROM, to },
    { storeId: SIHEUNG, to },
    { storeId: SIHEUNG, from: FROM },
    { storeId: SIHEUNG, from: "어제", to },
    { storeId: SIHEUNG, from: FROM, to: "2026-13-45" },
    { storeId: SIHEUNG, from: to, to: FROM },
    { storeId: SIHEUNG, from: FROM, to: FROM },
    { storeId: SIHEUNG, from: FROM, to: new Date(Date.parse(FROM) + MAX_RANGE_MS + 1).toISOString() }
  ];
  for (const values of rejected) {
    assert.ok("error" in query(values), `거부돼야 함: ${JSON.stringify(values)}`);
  }

  const ok = query({ storeId: SIHEUNG, from: FROM, to: new Date(Date.parse(FROM) + MAX_RANGE_MS).toISOString() });
  assert.ok(!("error" in ok));
  if (!("error" in ok)) assert.equal(ok.storeId, SIHEUNG);
});

test("무인 예약 매장만 허용: 운영중 시흥 O, 송도·그 외 매장·비운영·없음 X", () => {
  assert.equal(isPublicReservationStore({ id: SIHEUNG, status: "active" }), true);
  assert.equal(isPublicReservationStore({ id: SONGDO_STORE_ID, status: "active" }), false);
  // 새로 생긴 매장(예: 삼송)도 무인 예약 매장으로 지정되기 전에는 예약 화면·API 에 나오지 않는다.
  assert.equal(isPublicReservationStore({ id: "22222222-2222-4222-8222-222222222222", status: "active" }), false);
  for (const status of ["paused", "inactive", "closed", null]) {
    assert.equal(isPublicReservationStore({ id: SIHEUNG, status }), false, `${status} 매장은 제외`);
  }
  assert.equal(isPublicReservationStore(null), false);
  assert.equal(isPublicReservationStore(undefined), false);
});

test("응답에는 타석·시간·상태 네 칸만 나간다(개인정보 미포함)", () => {
  const rows = toAvailabilityRows([
    {
      bay_id: "bay-1",
      starts_at: FROM,
      ends_at: "2026-11-19T01:00:00.000Z",
      status: "confirmed",
      guest_name: "홍길동",
      guest_phone_last4: "1234",
      member_id: "m-1",
      user_id: "u-1",
      memo: "메모"
    }
  ]);
  assert.deepEqual(Object.keys(rows[0]).sort(), ["bay_id", "ends_at", "starts_at", "status"]);
  assert.ok(!JSON.stringify(rows).includes("홍길동"));
  assert.ok(!JSON.stringify(rows).includes("1234"));
});

// PostgREST 처럼: 요청 범위와 서버 최대 행 수 중 작은 만큼만 주고, count 는 전체 개수.
function fakeTable(total: number, serverMaxRows: number) {
  const all = Array.from({ length: total }, (_, index) => ({
    bay_id: index === total - 1 ? "bay-last" : `bay-${index % 7}`,
    starts_at: new Date(Date.parse(FROM) + index * 60_000).toISOString(),
    ends_at: new Date(Date.parse(FROM) + index * 60_000 + 30 * 60_000).toISOString(),
    status: "confirmed"
  }));
  const calls: Array<[number, number]> = [];
  const fetchPage = async (from: number, to: number) => {
    calls.push([from, to]);
    const end = Math.min(to + 1, from + serverMaxRows, all.length);
    return { data: all.slice(from, end), error: null, count: all.length };
  };
  return { all, calls, fetchPage };
}

test("행 제한을 넘어도 끝까지 읽어 마지막 예약 충돌을 잃지 않는다", async () => {
  for (const serverMaxRows of [1000, 300]) {
    const table = fakeTable(1203, serverMaxRows);
    const result = await collectAllRows(table.fetchPage, { pageSize: 500, maxRows: 5000 });
    assert.ok("rows" in result, `서버 최대 ${serverMaxRows}행에서 실패`);
    if (!("rows" in result)) continue;
    assert.equal(result.rows.length, 1203, `서버 최대 ${serverMaxRows}행에서 잘림`);

    const last = table.all[table.all.length - 1];
    const blocked = getBlockedBayIds(toAvailabilityRows(result.rows), new Date(last.starts_at), new Date(last.ends_at));
    assert.ok(blocked.has("bay-last"), "마지막 쪽의 예약이 충돌로 잡혀야 한다");
  }
});

test("조회 실패·개수 불명·상한 초과·중간 누락은 빈 목록이 아니라 실패", async () => {
  const failed = await collectAllRows(async () => ({ data: null, error: { message: "boom" }, count: null }));
  assert.deepEqual(failed, { error: "boom" });

  const noCount = await collectAllRows(async () => ({ data: [], error: null, count: null }));
  assert.ok("error" in noCount);

  const tooMany = await collectAllRows(async () => ({ data: [{}], error: null, count: 5001 }), { maxRows: 5000 });
  assert.ok("error" in tooMany);

  // 첫 쪽은 2행, 전체는 5행이라는데 다음 쪽이 비어 있다 → 잘린 결과를 성공으로 주면 안 된다.
  let call = 0;
  const shrunk = await collectAllRows(async () => ({ data: call++ === 0 ? [{}, {}] : [], error: null, count: 5 }), { pageSize: 2 });
  assert.ok("error" in shrunk);

  const empty = await collectAllRows(async () => ({ data: [], error: null, count: 0 }));
  assert.deepEqual(empty, { rows: [] });
});

test("화면: 실패·불완전 응답은 예외 → 예약 가능으로 표시되지 않는다", () => {
  const row: AvailabilityRow = { bay_id: "bay-1", starts_at: FROM, ends_at: FROM, status: "confirmed" };
  assert.throws(() => readAvailabilityPayload(false, { ok: true, complete: true, reservations: [] }));
  assert.throws(() => readAvailabilityPayload(true, null));
  assert.throws(() => readAvailabilityPayload(true, { ok: false, message: "예약할 수 없는 매장입니다." }), /예약할 수 없는 매장/);
  assert.throws(() => readAvailabilityPayload(true, { ok: true, reservations: [] }), "complete 표시 없으면 거부");
  assert.throws(() => readAvailabilityPayload(true, { ok: true, complete: true }));
  assert.throws(() => readAvailabilityPayload(true, { ok: true, complete: true, reservations: [{ bay_id: "x" }] }));
  assert.deepEqual(readAvailabilityPayload(true, { ok: true, complete: true, reservations: [row] }), [row]);
  assert.deepEqual(readAvailabilityPayload(true, { ok: true, complete: true, reservations: [] }), []);
});

test("매장 전환: 다른 매장의 현황은 쓰지 않는다(전환 직후엔 예약 가능 0)", () => {
  const rows: AvailabilityRow[] = [{ bay_id: "bay-1", starts_at: FROM, ends_at: FROM, status: "confirmed" }];
  assert.equal(availabilityForStore(null, SIHEUNG), null);
  assert.equal(availabilityForStore({ storeId: "other-store", rows }, SIHEUNG), null);
  assert.equal(availabilityForStore({ storeId: SIHEUNG, rows }, SIHEUNG), rows);
});

test("시간·타석 충돌: 겹치면 막고, 맞닿거나 다른 타석·종료 상태면 막지 않는다", () => {
  const at = (minutes: number) => new Date(Date.parse(FROM) + minutes * 60_000);
  const rows: AvailabilityRow[] = [
    { bay_id: "bay-1", starts_at: at(60).toISOString(), ends_at: at(120).toISOString(), status: "confirmed" },
    { bay_id: "bay-2", starts_at: at(60).toISOString(), ends_at: at(120).toISOString(), status: "requested" },
    ...INACTIVE_RESERVATION_STATUSES.map((status) => ({
      bay_id: `bay-${status}`,
      starts_at: at(60).toISOString(),
      ends_at: at(120).toISOString(),
      status
    })),
    { bay_id: null, starts_at: at(60).toISOString(), ends_at: at(120).toISOString(), status: "confirmed" }
  ];

  assert.deepEqual([...getBlockedBayIds(rows, at(90), at(150))].sort(), ["bay-1", "bay-2"]);
  assert.equal(getBlockedBayIds(rows, at(120), at(180)).size, 0, "끝나는 시각에 시작하면 겹치지 않는다");
  assert.equal(getBlockedBayIds(rows, at(0), at(60)).size, 0, "시작 시각에 끝나면 겹치지 않는다");
  assert.deepEqual(INACTIVE_RESERVATION_STATUSES, ["cancelled", "no_show", "completed"]);
});
