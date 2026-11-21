import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAgentRoundReports } from "./agent-round-reports.ts";

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
