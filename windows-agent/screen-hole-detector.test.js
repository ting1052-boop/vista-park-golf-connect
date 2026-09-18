/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHoleResolver, extractHoleCandidates, normalizeRoi } = require("./screen-hole-detector");

test("hole text requires a label unless a calibrated ROI allows digits", () => {
  assert.deepEqual(extractHoleCandidates("HOLE 12 PAR 4"), [12]);
  assert.deepEqual(extractHoleCandidates("3H"), [3]);
  assert.deepEqual(extractHoleCandidates("PAR 4 157m"), []);
  assert.deepEqual(extractHoleCandidates(" 7 ", { allowDigitsOnly: true }), [7]);
  assert.deepEqual(extractHoleCandidates("HOLE 19"), []);
});

test("a player label next to the hole line is not read as a hole", () => {
  // 2026-09-18 A-02 스크린 화면 실제 문구. 홀 줄과 플레이어 줄이 한 박스에 있다.
  assert.deepEqual(extractHoleCandidates("예천한천_CD 2 Hole Par4 68m 1 플레이어1 0 1 68.05m"), [2]);
  // 타석 모니터 상단은 플레이어 번호 바로 뒤에 Hole 이 이어진다.
  assert.deepEqual(extractHoleCandidates("플레이어1 Hole 3 Par 5"), [3]);
  // 거리·점수 숫자는 홀이 되지 않는다.
  assert.deepEqual(extractHoleCandidates("68.05m 141.71m"), []);
});

test("ROI rejects unsafe coordinates", () => {
  assert.deepEqual(normalizeRoi({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }), { x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
  assert.equal(normalizeRoi({ x: -0.1, y: 0, width: 1, height: 1 }), null);
});

test("resolver confirms two fresh frames and expires stale holes", () => {
  const resolver = createHoleResolver({ confirmationCount: 2, sampleWindow: 3, sampleWindowMs: 6_000, staleAfterMs: 5_000 });
  const base = Date.parse("2026-09-17T07:00:00.000Z");
  resolver.addSample({ contextEpoch: 1, frameId: "a", candidate: 2, observedAt: new Date(base).toISOString() });
  const confirmed = resolver.addSample({ contextEpoch: 1, frameId: "b", candidate: 2, observedAt: new Date(base + 1_000).toISOString() });
  assert.equal(confirmed.currentHole, 2);
  assert.equal(confirmed.holeStatus, "confirmed");
  const stale = resolver.snapshot(base + 7_000, 1, true);
  assert.equal(stale.currentHole, null);
  assert.equal(stale.lastKnownHole, 2);
});

test("old matching samples do not confirm a hole", () => {
  const resolver = createHoleResolver({ confirmationCount: 2, sampleWindowMs: 6_000 });
  const base = Date.parse("2026-09-17T07:00:00.000Z");
  resolver.addSample({ contextEpoch: 2, frameId: "a", candidate: 9, observedAt: new Date(base).toISOString() });
  const result = resolver.addSample({ contextEpoch: 2, frameId: "b", candidate: 9, observedAt: new Date(base + 7_000).toISOString() });
  assert.equal(result.currentHole, null);
});

test("context changes discard previous observations", () => {
  const resolver = createHoleResolver({ confirmationCount: 2 });
  resolver.addSample({ contextEpoch: 1, frameId: "a", candidate: 8, observedAt: new Date().toISOString() });
  resolver.addSample({ contextEpoch: 1, frameId: "b", candidate: 8, observedAt: new Date().toISOString() });
  assert.equal(resolver.snapshot(Date.now(), 2, true).currentHole, null);
});
