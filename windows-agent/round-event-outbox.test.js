/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRoundEventOutbox } = require("./round-event-outbox");

test("outbox survives restart and removes only acknowledged events", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vista-outbox-"));
  const filePath = path.join(dir, "outbox.json");
  try {
    let outbox = createRoundEventOutbox({ filePath, bayCode: "A-02" });
    outbox.enqueue({ eventId: "one", roundId: "r1" });
    outbox.enqueue({ eventId: "two", roundId: "r2" });
    outbox = createRoundEventOutbox({ filePath, bayCode: "A-02" });
    assert.equal(outbox.pendingCount(), 2);
    outbox.applyServerResult(["one"], []);
    assert.deepEqual(outbox.list().map((event) => event.eventId), ["two"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("another bay never inherits pending events", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vista-outbox-bay-"));
  const filePath = path.join(dir, "outbox.json");
  try {
    const first = createRoundEventOutbox({ filePath, bayCode: "A-01" });
    first.enqueue({ eventId: "one", roundId: "r1" });
    const second = createRoundEventOutbox({ filePath, bayCode: "A-02" });
    assert.equal(second.pendingCount(), 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
