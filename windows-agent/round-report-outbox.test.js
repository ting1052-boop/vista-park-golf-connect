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
fs.rmSync(dir, { recursive: true, force: true });
console.log("round-report-outbox tests passed");
