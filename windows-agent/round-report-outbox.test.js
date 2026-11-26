/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRoundReportOutbox } = require("./round-report-outbox");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vista-round-outbox-"));
const outbox = createRoundReportOutbox({ filePath: path.join(dir, "outbox.json"), bayCode: "P-01" });
const open = { roundId: "r1", revision: 1 };
assert.equal(outbox.enqueue(open), true);
assert.equal(outbox.enqueue(open), false);
assert.equal(outbox.enqueue({ roundId: "r1", revision: 2 }), true);
assert.equal(outbox.list()[0].revision, 2);
outbox.applyServerResult([{ roundId: "r1", revision: 1 }], []);
assert.equal(outbox.list().length, 1);
outbox.applyServerResult([{ roundId: "r1", revision: 2 }], []);
assert.equal(outbox.list().length, 0);

// 서버가 roundId·revision 을 붙여 영구 거절(invalid_report_N)하면 지운다. storage_unavailable 은 남긴다.
outbox.enqueue({ roundId: "r9", revision: 2 });
outbox.enqueue({ roundId: "r8", revision: 2 });
outbox.applyServerResult([], [{ roundId: "r9", revision: 2, code: "invalid_report_0" }, { roundId: "r8", revision: 2, code: "storage_unavailable" }]);
assert.deepEqual(outbox.list().map((report) => report.roundId), ["r8"]);

// 전원 차단으로 깨진 파일: 옆으로 치우고 새로 시작한다(예전에는 저장할 때마다 throw)
fs.writeFileSync(path.join(dir, "outbox.json"), "{\"version\":1,");
const fresh = createRoundReportOutbox({ filePath: path.join(dir, "outbox.json"), bayCode: "P-01" });
assert.equal(fresh.enqueue({ roundId: "r1", revision: 1 }), true);
assert.ok(fs.readdirSync(dir).some((name) => name.startsWith("outbox.json.corrupt-")));
fs.rmSync(dir, { recursive: true, force: true });
console.log("round-report-outbox tests passed");
