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
fs.rmSync(dir, { recursive: true, force: true });
console.log("round-ledger tests passed");
