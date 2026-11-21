import assert from "node:assert/strict";
import test from "node:test";
import { MIN_HOLES_FOR_GAME, classifyRound } from "./round-classify.ts";

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
