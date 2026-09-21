import assert from "node:assert/strict";
import test from "node:test";
import { isEnrollmentOpen } from "./pc-enrollment.ts";

const now = new Date("2026-09-21T10:00:00.000Z");
const later = new Date("2026-09-21T10:20:00.000Z").toISOString();
const earlier = new Date("2026-09-21T09:40:00.000Z").toISOString();

test("창이 열려 있으려면 시간과 횟수가 모두 남아야 한다", () => {
  assert.equal(isEnrollmentOpen(later, 5, now), true);
});

test("시간이 지나면 횟수가 남아도 닫힌다", () => {
  assert.equal(isEnrollmentOpen(earlier, 5, now), false);
});

test("횟수를 다 쓰면 시간이 남아도 닫힌다", () => {
  assert.equal(isEnrollmentOpen(later, 0, now), false);
});

test("연 적이 없으면 닫힌 것이다", () => {
  assert.equal(isEnrollmentOpen(null, 5, now), false);
  assert.equal(isEnrollmentOpen(later, null, now), false, "횟수를 모르면 열어주지 않는다");
});

test("망가진 시각은 열어주지 않는다", () => {
  assert.equal(isEnrollmentOpen("언제까지인지 모름", 5, now), false);
});
