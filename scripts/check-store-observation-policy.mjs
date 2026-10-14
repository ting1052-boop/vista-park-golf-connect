import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const songdo = "b2f7192b-9472-4006-a58d-ffec3afc90ce";
function load(path, dependencies = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports, require: (name) => dependencies[name] });
  return exports;
}
const { getStoreObservationPolicy: policy } = load("../src/lib/store-observation-policy.ts", { "@/lib/automation/device-map": { SONGDO_STORE_ID: songdo } });
assert.equal(policy(songdo).refreshIntervalMs, 60_000);
assert.equal(policy(songdo).pcSignalMaxAgeMs, 180_000);
assert.equal(policy(songdo).telemetryMaxAgeMs, 150_000);
assert.equal(policy("other-store").refreshIntervalMs, 15_000);
assert.equal(policy("other-store").pcSignalMaxAgeMs, 120_000);
assert.equal(policy("other-store").telemetryMaxAgeMs, 45_000);
const { getUsageState: usage } = load("../src/lib/bay-operating-state.ts");
const now = Date.now();
const telemetry = { observedAt: new Date(now - 65_000).toISOString(), gameRunning: true, usage: { state: "active", endsAt: new Date(now + 60_000).toISOString() } };
assert.equal(usage(false, true, telemetry, now, policy(songdo).telemetryMaxAgeMs), "in_use");
assert.equal(usage(false, true, telemetry, now), "unknown");
assert.equal(usage(false, false, telemetry, now, 150_000), "unknown");
assert.equal(usage(false, true, { ...telemetry, observedAt: new Date(now - 151_000).toISOString() }, now, 150_000), "unknown");
assert.equal(usage(true, false, null, now, 150_000), "in_use");
const dashboard = fs.readFileSync(new URL("../src/app/admin/dashboard/dashboard-client.tsx", import.meta.url), "utf8");
assert.match(dashboard, /getStoreObservationPolicy\(currentStoreId\)\.refreshIntervalMs/);
const automation = fs.readFileSync(new URL("../src/app/admin/automation/automation-client.tsx", import.meta.url), "utf8");
assert.match(automation, /commandPending \? 5_000/);
assert.match(automation, /visibilityState === "visible"/);
console.log("Observation policy checks passed: Songdo slow polling/freshness, commercial defaults, offline/stale safety and rapid pending command refresh.");
