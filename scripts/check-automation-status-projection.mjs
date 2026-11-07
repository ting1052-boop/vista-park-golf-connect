import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";

function load(file, modules = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS }
  }).outputText;
  vm.runInNewContext(code, { exports, require(name) {
    assert.ok(name in modules, `Unexpected import: ${name}`);
    return modules[name];
  } });
  return exports;
}

const deviceMap = load("src/lib/automation/device-map.ts");
let adminDb;
const automation = load("src/lib/supabase/automation-status.ts", {
  "@/lib/automation/device-map": deviceMap,
  "@/lib/supabase/server": { createSupabaseAdminClient: () => adminDb }
});
const plain = (value) => JSON.parse(JSON.stringify(value));
const iso = (index) => new Date(Date.parse("2026-11-07T00:00:00Z") - index * 1000).toISOString();
const command = (index, overrides = {}) => ({
  store_id: "store-a", status: "succeeded", created_at: iso(index), completed_at: iso(index - 0.5),
  response_payload: { steps: [{ script: "frequent", ok: true }], unused: "x".repeat(8192) },
  payload: { scripts: [{ script: "frequent" }], unused: "y".repeat(8192) }, ...overrides
});

// Reference reducer before JSON-path projection, including malformed-entry behavior.
function legacyRuns(commands) {
  const latest = new Map();
  for (const row of commands) {
    const at = row.completed_at ?? row.created_at;
    const pending = row.status === "pending" || row.status === "processing";
    const scripts = row.payload?.scripts;
    const payload = row.response_payload;
    const steps = pending
      ? (Array.isArray(scripts) ? scripts.map((script) => ({ script: script.script, ok: false })) : [])
      : (payload && typeof payload === "object" && Array.isArray(payload.steps) ? payload.steps : []);
    for (const step of steps) {
      if (typeof step.script !== "string" || step.script.length === 0 || latest.has(step.script)) continue;
      latest.set(step.script, { ok: step.ok === true, at, pending });
    }
  }
  return latest;
}

function database(rows, { includePending = false, error = false, nullData = false } = {}) {
  const statuses = includePending ? ["pending", "processing", "succeeded", "failed"] : ["succeeded", "failed"];
  const selected = rows.filter((row) => row.store_id === "store-a" && statuses.includes(row.status))
    .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 200);
  const calls = [];
  const db = createClient("https://projection-test.invalid", "test-only-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input);
      assert.equal(url.pathname, "/rest/v1/store_controller_commands");
      assert.equal(init?.method ?? "GET", "GET");
      assert.deepEqual([...url.searchParams.keys()].sort(), ["limit", "order", "select", "status", "store_id"]);
      assert.equal(url.searchParams.get("store_id"), "eq.store-a");
      assert.equal(url.searchParams.get("status"), `in.(${statuses.join(",")})`);
      assert.equal(url.searchParams.get("order"), "created_at.desc");
      assert.equal(url.searchParams.get("limit"), "200");
      const columns = url.searchParams.get("select");
      assert.equal(columns, "status,created_at,completed_at,response_steps:response_payload->steps,payload_scripts:payload->scripts");
      // Return only requested columns, as PostgREST does (missing JSON keys become null).
      const projected = selected.map((row) => Object.fromEntries(columns.split(",").map((column) => {
        if (!column.includes(":")) return [column, row[column]];
        const [alias, path] = column.split(":");
        const [root, key] = path.split("->");
        const json = row[root];
        return [alias, json && typeof json === "object" && !Array.isArray(json) ? json[key] ?? null : null];
      })));
      calls.push({ projected, fullBytes: JSON.stringify(selected).length });
      return new Response(JSON.stringify(error ? { message: "history unavailable", code: "TEST" } : nullData ? null : projected), {
        status: error ? 500 : 200, headers: { "Content-Type": "application/json" }
      });
    } }
  });
  return { db, selected, calls };
}

async function compare(rows, includePending = false) {
  const fixture = database(rows, { includePending });
  const actual = await automation.getLatestScriptRuns(fixture.db, "store-a", includePending);
  assert.deepEqual(plain([...actual]), plain([...legacyRuns(fixture.selected)]));
  assert.equal(fixture.calls.length, 1);
  for (const [on, off] of [["on", "off"], ["rare", "absent"], ["absent", "missing"]]) {
    assert.deepEqual(plain(automation.getPowerState(actual, on, off)),
      plain(automation.getPowerState(legacyRuns(fixture.selected), on, off)));
  }
  return { ...fixture, actual };
}

const history = Array.from({ length: 202 }, (_, index) => command(index));
history[0] = command(0, { status: "pending", completed_at: null,
  payload: { scripts: [{ name: "not-an-id", script: "on" }, { script: "on" }] },
  response_payload: { steps: [{ script: "must-not-use-pending-response", ok: true }] } });
history[1] = command(1, { status: "processing", completed_at: null, payload: { scripts: [{ script: "off" }] } });
history[2] = command(2, { status: "failed", response_payload: { steps: [
  { script: "on", ok: false }, { script: "on", ok: true }, { script: "strict", ok: "true" },
  { script: "", ok: true }, { script: 42, ok: true }, {}, false, "bad"
] } });
history[3] = command(3, { completed_at: iso(-100), response_payload: { steps: [{ script: "on", ok: true }] } });
history[199] = command(199, { response_payload: { steps: [{ script: "rare", ok: true }] } });
history[200] = command(200, { response_payload: { steps: [{ script: "outside-pending-window", ok: true }] } });
history[201] = command(201, { response_payload: { steps: [{ script: "completed-boundary", ok: true }] } });
history.push(command(-2, { store_id: "other", response_payload: { steps: [{ script: "foreign", ok: true }] } }));
history.push(command(-1, { status: "cancelled", response_payload: { steps: [{ script: "cancelled", ok: true }] } }));
for (const includePending of [false, true]) {
  const { actual, calls, selected } = await compare([...history].reverse(), includePending);
  assert.equal(selected.length, 200);
  assert.equal(actual.get("rare").ok, true);
  assert.equal(actual.get("on").pending, includePending);
  assert.equal(actual.get("on").ok, false);
  assert.equal(actual.get("strict").ok, false);
  assert.equal(actual.has("foreign"), false);
  assert.equal(actual.has("cancelled"), false);
  assert.equal(actual.has("not-an-id"), false);
  assert.equal(actual.has("must-not-use-pending-response"), false);
  assert.equal(actual.has("outside-pending-window"), !includePending);
  assert.equal(actual.has("completed-boundary"), !includePending);
  assert.ok(JSON.stringify(calls[0].projected).length < calls[0].fullBytes / 10);
}

for (const status of ["pending", "processing", "succeeded", "failed"]) {
  for (const malformed of [undefined, null, false, 3, "bad", [], {}, { scripts: null, steps: null },
    { scripts: "bad", steps: {} }, { scripts: [{ script: "on" }], steps: [{ script: "on", ok: true }] }]) {
    await compare([command(0, { status, payload: malformed, response_payload: malformed })], true);
  }
  // Null array entries already reject; projection must not silently alter that contract.
  for (const entry of [null, undefined]) {
    const fixture = database([command(0, { status, payload: { scripts: [entry] }, response_payload: { steps: [entry] } })], { includePending: true });
    assert.throws(() => legacyRuns(fixture.selected), TypeError);
    await assert.rejects(automation.getLatestScriptRuns(fixture.db, "store-a", true), { name: "TypeError" });
  }
}
await compare([]);
assert.equal((await automation.getLatestScriptRuns(database([], { nullData: true }).db, "store-a")).size, 0);
await assert.rejects(automation.getLatestScriptRuns(database([], { error: true }).db, "store-a"), /history unavailable/);

const common = deviceMap.commonAutomationScripts;
const bay = deviceMap.siheungBayAutomation[0];
for (const status of ["pending", "processing", "succeeded", "failed"]) {
  for (const direction of ["on", "off"]) {
    const script = common[direction];
    adminDb = database([command(0, { status, completed_at: null,
      payload: { scripts: [{ script }] }, response_payload: { steps: [{ script, ok: status === "succeeded" }] } }),
    command(1, { response_payload: { steps: [{ script: bay.enterScript, ok: true }] } })], { includePending: true }).db;
    const rows = await automation.getAutomationDeviceStatuses("store-a");
    const pending = status === "pending" || status === "processing";
    assert.equal(rows.length, 2);
    assert.equal(rows[0].tone, pending ? "unknown" : status === "failed" ? "failed" : direction);
    assert.equal(rows[0].lastRunAt, iso(0));
    assert.equal(rows[1].tone, "on");
  }
}
console.log("Automation status projection: real SDK query, 200-row history, rare scripts, caller states, malformed/null parity, errors and transfer reduction passed");
