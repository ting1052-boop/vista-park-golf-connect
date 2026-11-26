import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAgentRoundReports, rawRoundReportKey } from "./agent-round-reports.ts";

const now = Date.parse("2026-11-21T03:00:00.000Z");
const base = {
  roundId: "123e4567-e89b-42d3-a456-426614174000",
  revision: 1,
  status: "open",
  kind: "course",
  courseId: "course-a",
  startedAt: "2026-11-21T02:00:00.000Z",
  timeBasis: "observed",
  holeSource: "none",
  runs: [],
  agentVersion: "0.10.0"
};

test("accepts an open course and a closed one-hour practice report", () => {
  const reports = normalizeAgentRoundReports([base, {
    ...base,
    roundId: "123e4567-e89b-42d3-a456-426614174001",
    status: "closed",
    kind: "practice",
    endedAt: "2026-11-21T03:00:00.000Z",
    endKind: "returned_to_lobby"
  }], now);
  assert.equal(reports?.length, 2);
  assert.equal(reports?.every(Boolean), true);
});

test("rejects invalid masks, stale reports, and open practice", () => {
  const reports = normalizeAgentRoundReports([
    { ...base, status: "closed", endedAt: "2026-11-21T03:00:00.000Z", endKind: "log_ended", holeSource: "native_log", runs: [{ enteredMask: 1, endedMask: 262144 }] },
    { ...base, startedAt: "2026-10-01T00:00:00.000Z" },
    { ...base, kind: "practice" }
  ], now);
  assert.deepEqual(reports, [null, null, null]);
});

test("rejects oversized batches", () => {
  assert.equal(normalizeAgentRoundReports(Array.from({ length: 11 }, () => base), now), null);
});

test("23:58 시작 00:07 종료(KST) 판은 종료 시각 그대로 받아 종료일(다음 날)로 집계될 수 있다", () => {
  const [report] = normalizeAgentRoundReports([{
    ...base, revision: 3, status: "closed", startedAt: "2026-11-25T14:58:12.000Z", endedAt: "2026-11-25T15:07:00.000Z",
    endKind: "returned_to_lobby", holeSource: "native_log",
    runs: [{ enteredMask: 511, endedMask: 256, progressedHoles: 99 }]
  }], Date.parse("2026-11-26T00:00:00.000Z")) ?? [];
  assert.ok(report);
  assert.deepEqual(report.runs, [{ enteredMask: 511, endedMask: 256 }], "Agent 가 보낸 다른 값은 버리고 서버가 다시 계산한다");
  // DB 의 play_date = (ended_at at time zone 'Asia/Seoul')::date 와 같은 계산
  const kstDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(report.endedAt!));
  assert.equal(kstDate, "2026-11-26");
});

test("영구 거절 보고도 roundId·revision 을 돌려줘 Agent outbox 가 지울 수 있다", () => {
  const tooLong = { ...base, revision: 2, status: "closed", endedAt: "2026-11-29T03:00:00.000Z", endKind: "game_exit", startedAt: "2026-11-21T02:00:00.000Z" };
  assert.equal(normalizeAgentRoundReports([tooLong], Date.parse("2026-11-29T03:00:00.000Z"))?.[0], null);
  assert.deepEqual(rawRoundReportKey(tooLong), { roundId: base.roundId, revision: 2 });
  assert.deepEqual(rawRoundReportKey("junk"), { roundId: null, revision: null });
});
