import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const compiled = ts.transpileModule(fs.readFileSync(new URL("../src/lib/bay-operating-state.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS }
}).outputText;
const exports = {};
vm.runInNewContext(compiled, { exports });
const { getPcConnectionState: pc, getUsageState: usage } = exports;
const now = Date.parse("2026-10-09T01:00:00Z");
const iso = (delta) => new Date(now + delta).toISOString();
const shutdown = { status: "succeeded", created_at: iso(-20000), completed_at: iso(-10000) };
assert.equal(pc(true, iso(-15000), undefined, now), "connected");
assert.equal(pc(false, iso(-180000), undefined, now), "no_signal");
assert.equal(pc(true, iso(-15000), shutdown, now), "shutdown_pending");
assert.equal(pc(false, iso(-15000), shutdown, now), "shutdown_pending");
assert.equal(pc(true, iso(0), { ...shutdown, completed_at: iso(-40000) }, now), "connected");
assert.equal(pc(false, iso(-180000), { ...shutdown, completed_at: iso(-180000) }, now), "no_signal");
assert.equal(pc(true, iso(0), { ...shutdown, status: "failed" }, now), "connected");
assert.equal(pc(true, iso(0), { ...shutdown, status: "pending" }, now), "shutdown_pending");
assert.equal(pc(false, null, { ...shutdown, status: "pending", created_at: iso(-360000) }, now), "no_signal");
const telemetry = { observedAt: iso(-10000), gameRunning: true, usage: { state: "active", endsAt: iso(60000) } };
assert.equal(usage(false, true, telemetry, now), "in_use");
assert.equal(usage(false, false, telemetry, now), "unknown");
assert.equal(usage(false, true, { ...telemetry, observedAt: iso(-60000) }, now), "unknown");
assert.equal(usage(false, true, { ...telemetry, observedAt: iso(10000) }, now), "unknown");
assert.equal(usage(false, true, { ...telemetry, usage: { state: "awaiting_input" } }, now), "idle");
assert.equal(usage(false, true, { ...telemetry, usage: { state: "unknown" } }, now), "unknown");
assert.equal(usage(false, true, { ...telemetry, usage: undefined, gameRunning: false }, now), "idle");
assert.equal(usage(false, true, null, now), "unknown");
assert.equal(usage(true, false, null, now), "in_use");
console.log("Bay operating state: 18 checks passed");

const automation = {};
const automationCode = ts.transpileModule(fs.readFileSync(new URL("../src/lib/supabase/automation-status.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS }
}).outputText;
vm.runInNewContext(automationCode, { exports: automation, require: () => ({}) });
let selectedStatuses;
const records = [
  { status: "pending", created_at: iso(-1000), completed_at: null, payload: { scripts: [{ name: "타석 준비", script: "bay_on" }] } },
  { status: "succeeded", created_at: iso(-2000), completed_at: iso(-1500), response_payload: { steps: [{ script: "bay_on", ok: true }] } }
];
const db = { from() { return {
  select() { return this; }, eq() { return this; },
  in(_field, values) { selectedStatuses = values; return this; }, order() { return this; },
  async limit() { return { data: records.filter((row) => selectedStatuses.includes(row.status)), error: null }; }
}; } };
const completed = await automation.getLatestScriptRuns(db, "songdo");
assert.equal(selectedStatuses.includes("pending"), false);
assert.equal(automation.getPowerState(completed, "bay_on", "bay_off").pending, false);
const pending = await automation.getLatestScriptRuns(db, "songdo", true);
assert.equal(selectedStatuses.includes("pending"), true);
assert.equal(pending.has("타석 준비"), false);
const command = automation.getPowerState(pending, "bay_on", "bay_off");
assert.equal(command.pending, true);
assert.equal(command.failed, false);
console.log("Equipment request display and reservation isolation: 6 checks passed");
