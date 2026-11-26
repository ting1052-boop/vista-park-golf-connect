/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRoundLedger } = require("./round-ledger");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vista-round-ledger-"));
const reports = [];
const ledger = createRoundLedger({ filePath: path.join(dir, "ledger.json"), agentVersion: "0.10.0", onReport: (report) => reports.push(report) });
ledger.observe({ gameState: "playing", gameMode: "regular", courseId: "A", roundId: "r1", observedAt: "2026-11-21T01:00:00.000Z" });
ledger.observe({ gameState: "playing", gameMode: "regular", courseId: "A", roundId: "r1", observedAt: "2026-11-21T01:01:00.000Z" });
ledger.observe({ gameState: "unknown", gameMode: "unknown", observedAt: "2026-11-21T01:30:00.000Z" });
assert.equal(ledger.getActive()?.roundId, "r1", "temporary monitor failures must not close a round");
ledger.observe({ gameState: "menu", gameMode: "lobby", observedAt: "2026-11-21T02:00:00.000Z" });
assert.deepEqual(reports.map((report) => [report.status, report.revision]), [["open", 1], ["closed", 2]]);

ledger.observe({ gameState: "practice", gameMode: "practice", courseId: "Practice_A", observedAt: "2026-11-21T03:00:00.000Z" });
ledger.observe({ gameState: "menu", gameMode: "lobby", observedAt: "2026-11-21T03:10:00.000Z" });
assert.equal(reports.at(-1).kind, "practice");
assert.equal(reports.at(-1).status, "closed");

// 강제 전원 차단: 2분 넘게 관측이 끊겼다가 다음 날 같은 코스로 다시 들어와도 이어 붙이지 않고, 마지막 관측 시각에 닫는다(play_date = 실제 날).
{
  const file = path.join(dir, "stale.json");
  const out = [];
  let clock = Date.parse("2026-11-21T13:00:00.000Z");
  const make = () => createRoundLedger({ filePath: file, agentVersion: "0.10.1", onReport: (r) => out.push(r), now: () => clock });
  let stale = make();
  const playing = { gameState: "playing", gameMode: "regular", courseId: "A", observedAt: "2026-11-21T13:00:00.000Z" };
  stale.observe(playing);
  clock += 90_000;
  stale.observe(playing); // 판 도중 telemetry.observedAt 은 멈춰 있어도 살아 있음(lastSeenAt)은 저장된다
  assert.equal(stale.getActive()?.lastSeenAt, "2026-11-21T13:01:30.000Z");
  clock = Date.parse("2026-11-22T00:30:00.000Z");
  stale = make();
  stale.observe({ ...playing, observedAt: "2026-11-22T00:29:50.000Z" });
  const closed = out.find((r) => r.status === "closed");
  assert.deepEqual([closed.endKind, closed.endedAt], ["game_exit", "2026-11-21T13:01:30.000Z"]);
  assert.notEqual(stale.getActive()?.roundId, closed.roundId, "새 판으로 시작해야 한다");
  assert.equal(stale.pendingHoleRounds()[0].endedAt, "2026-11-21T13:01:30.000Z");

  // 0.10.0 원장(lastSeenAt 없음)은 업데이트 직후 진행 중인 판을 닫지 않는다
  fs.writeFileSync(file, JSON.stringify({ version: 1, active: { roundId: "old", kind: "course", courseId: "A", startedAt: "2026-11-22T00:00:00.000Z", reported: true } }));
  out.length = 0;
  stale = make();
  stale.observe({ ...playing, observedAt: "2026-11-22T00:00:00.000Z" });
  assert.equal(stale.getActive()?.roundId, "old");
  assert.equal(out.length, 0);

  // 전원 차단으로 빈 파일이 남아도 영구 정지하지 않는다: 옆으로 치우고 새로 시작
  fs.writeFileSync(file, "");
  stale = make();
  stale.observe(playing);
  assert.ok(stale.getActive());
  assert.ok(fs.readdirSync(dir).some((name) => name.startsWith("stale.json.corrupt-")));
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).version, 1);
}

fs.rmSync(dir, { recursive: true, force: true });
console.log("round-ledger tests passed");
