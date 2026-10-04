/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createUsageWindowMonitor } = require("./usage-window-monitor");

function createIds() {
  let value = 0;
  return () => `00000000-0000-4000-8000-${String(++value).padStart(12, "0")}`;
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "vista-usage-window-"));
const filePath = path.join(root, "usage.json");
let time = Date.parse("2026-10-04T00:00:00.000Z");
const options = {
  filePath,
  bayCode: "SD-R-01",
  durationMs: 60 * 60_000,
  now: () => time,
  createId: createIds(),
  agentVersion: "test"
};

const monitor = createUsageWindowMonitor(options);
assert.equal(monitor.observe({ gameRunning: true, trigger: false, healthy: true }).state, "awaiting_input");
const started = monitor.observe({
  gameRunning: true,
  trigger: true,
  healthy: true,
  source: "foreground_input",
  confidence: "medium",
  lastInputAt: time
});
assert.equal(started.state, "active");
assert.equal(monitor.listEvents().length, 1);

time += 30 * 60_000;
const same = monitor.observe({
  gameRunning: true,
  trigger: true,
  healthy: true,
  source: "foreground_input",
  confidence: "medium",
  lastInputAt: time
});
assert.equal(same.usageId, started.usageId);
assert.equal(same.endsAt, started.endsAt, "입력은 60분 창을 연장하지 않는다");

const restored = createUsageWindowMonitor({ ...options, createId: createIds() });
assert.equal(restored.observe({ gameRunning: true, trigger: false, healthy: true }).usageId, started.usageId);
assert.equal(restored.listEvents().length, 1, "재시작 후 시작 이벤트를 중복 생성하지 않는다");

time += 30 * 60_000;
assert.equal(restored.observe({ gameRunning: true, trigger: false, healthy: true }).state, "awaiting_input");
assert.equal(restored.listEvents().length, 2);
assert.equal(restored.listEvents()[1].endReason, "duration_elapsed");

time += 1;
assert.equal(restored.observe({
  gameRunning: true,
  trigger: true,
  healthy: true,
  source: "foreground_input",
  confidence: "medium",
  lastInputAt: time
}).state, "active");
assert.equal(restored.listEvents().filter((event) => event.eventType === "usage_started").length, 2);

restored.applyServerResult(restored.listEvents().map((event) => event.eventId), []);
assert.equal(restored.pendingCount(), 0);

const parkFile = path.join(root, "park.json");
const park = createUsageWindowMonitor({ ...options, filePath: parkFile, bayCode: "SD-P-01", createId: createIds() });
assert.equal(park.observe({
  gameRunning: true,
  trigger: true,
  healthy: true,
  source: "park_log",
  confidence: "high"
}).source, "park_log");
time += 1_000;
assert.equal(park.observe({ gameRunning: false, trigger: false, healthy: true }).state, "awaiting_input");
assert.equal(park.listEvents()[1].endReason, "process_exit");

fs.rmSync(root, { recursive: true, force: true });
console.log("Usage window monitor tests passed");
