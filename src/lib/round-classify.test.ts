import assert from "node:assert/strict";
import test from "node:test";
import { MIN_HOLES_FOR_GAME, classifyRound, holeCounts } from "./round-classify.ts";

const mask = (holes: number) => (1 << holes) - 1;
const run = (endedHoles: number) => ({ enteredMask: mask(Math.max(endedHoles, 1)), endedMask: mask(endedHoles) });

test("9홀 경계와 18홀은 묶음당 정확히 1회로 센다", () => {
  assert.equal(MIN_HOLES_FOR_GAME, 9);
  assert.deepEqual(classifyRound({ status: "closed", kind: "course", holeSource: "native_log", runs: [run(18)] }), {
    completion: "counted",
    countedGames: 1
  });
  assert.deepEqual(classifyRound({ status: "closed", kind: "course", holeSource: "native_log", runs: [run(9)] }), {
    completion: "counted",
    countedGames: 1
  });
  assert.deepEqual(classifyRound({ status: "closed", kind: "course", holeSource: "native_log", runs: [run(8)] }), {
    completion: "partial",
    countedGames: 0
  });
});

test("다시하기 묶음은 따로 세고 9홀 미만 묶음은 합치지 않는다", () => {
  assert.deepEqual(classifyRound({ status: "closed", kind: "course", holeSource: "native_log", runs: [run(18), run(18)] }), {
    completion: "counted",
    countedGames: 2
  });
  assert.deepEqual(classifyRound({ status: "closed", kind: "course", holeSource: "native_log", runs: [run(5), run(5)] }), {
    completion: "partial",
    countedGames: 0
  });
});

test("홀 진입만 있고 종료가 없어도 partial이다", () => {
  assert.deepEqual(classifyRound({
    status: "closed",
    kind: "course",
    holeSource: "native_log",
    runs: [{ enteredMask: 1, endedMask: 0 }]
  }), { completion: "partial", countedGames: 0 });
});

test("open, 연습, 근거 없음, 빈 native 묶음, OCR은 집계하지 않는다", () => {
  assert.deepEqual(classifyRound({ status: "open", kind: "course", holeSource: "none", runs: [] }), {
    completion: "open",
    countedGames: 0
  });
  assert.deepEqual(classifyRound({ status: "closed", kind: "practice", holeSource: "none", runs: [] }), {
    completion: "practice",
    countedGames: 0
  });
  for (const input of [
    { status: "closed" as const, kind: "course" as const, holeSource: "none" as const, runs: [] },
    { status: "closed" as const, kind: "course" as const, holeSource: "native_log" as const, runs: [] },
    { status: "closed" as const, kind: "course" as const, holeSource: "ocr" as const, runs: [run(18)] }
  ]) {
    assert.deepEqual(classifyRound(input), { completion: "unverified", countedGames: 0 });
  }
});

const bits = (...holes: number[]) => holes.reduce((value, hole) => value | (1 << (hole - 1)), 0);
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const closed = (runs: Array<{ enteredMask: number; endedMask: number }>) =>
  classifyRound({ status: "closed", kind: "course", holeSource: "native_log", runs });

test("2026-11-25 시흥 A-02 실측 두 판은 '진행한 홀' 기준으로 각각 1회다", () => {
  // 18홀 판: 1-4·18 홀아웃, 5-17 건너뜀
  const game18 = { enteredMask: bits(...range(1, 18)), endedMask: bits(1, 2, 3, 4, 18) };
  // 9홀 판: 1-3·8-9 홀아웃, 4-7 건너뜀, 끝나고 10홀 자동 진입
  const game9 = { enteredMask: bits(...range(1, 10)), endedMask: bits(1, 2, 3, 8, 9) };
  assert.deepEqual(holeCounts(game18), { progressedHoles: 18, holedOutHoles: 5 });
  assert.deepEqual(holeCounts(game9), { progressedHoles: 9, holedOutHoles: 5 });
  assert.deepEqual(closed([game18]), { completion: "counted", countedGames: 1 });
  assert.deepEqual(closed([game9]), { completion: "counted", countedGames: 1 });
});

test("진행 8홀이면 중도 종료다", () => {
  // 9번 홀에 들어갔지만 끝내지 않고 나감 = 1-8 진행
  const run = { enteredMask: bits(...range(1, 9)), endedMask: bits(1, 2) };
  assert.equal(holeCounts(run).progressedHoles, 8);
  assert.deepEqual(closed([run]), { completion: "partial", countedGames: 0 });
  // 8번 홀까지 들어가 8번을 홀아웃하고 나감 = 8
  assert.deepEqual(closed([{ enteredMask: bits(...range(1, 8)), endedMask: bits(8) }]), { completion: "partial", countedGames: 0 });
});
