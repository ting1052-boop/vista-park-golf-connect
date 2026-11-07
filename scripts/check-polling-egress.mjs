import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import ts from "typescript";

function load(file, modules = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS }
  }).outputText;
  vm.runInNewContext(code, { exports, console, process: { env: {} }, require(name) {
    assert.ok(name in modules, `Unexpected import: ${name}`);
    return modules[name];
  } });
  return exports;
}

function database(rows, { loseClaim = false, failRead = false } = {}) {
  const queries = [];
  return { queries, from(table) {
    const record = { table, filters: [], columns: null, patch: null };
    queries.push(record);
    let count = Infinity;
    const query = {
      select(columns) { record.columns = columns; return this; },
      update(patch) { record.patch = patch; return this; },
      eq(key, value) { record.filters.push((row) => row[key] === value); return this; },
      in(key, values) { record.filters.push((row) => values.includes(row[key])); return this; },
      lt(key, value) { record.filters.push((row) => row[key] != null && row[key] < value); return this; },
      gte(key, value) { record.filters.push((row) => row[key] >= value); return this; },
      order() { return this; },
      limit(value) { count = value; return this; },
      maybeSingle() { return Promise.resolve(execute(true)); },
      then(resolve, reject) { return Promise.resolve(execute(false)).then(resolve, reject); }
    };
    function execute(single) {
      if (failRead && !record.patch) return { data: null, error: { message: "read failed" } };
      let matches = rows.filter((row) => record.filters.every((test) => test(row))).slice(0, count);
      if (loseClaim && record.patch?.status === "processing") matches = [];
      if (record.patch) matches.forEach((row) => Object.assign(row, record.patch));
      const data = record.columns ? matches.map((row) => Object.fromEntries(
        record.columns.split(",").map((key) => [key.trim(), row[key.trim()]])
      )) : [];
      return { data: single ? data[0] ?? null : data, error: null };
    }
    return query;
  } };
}

const auth = load("src/lib/agent-server.ts", { crypto, "@/lib/game-telemetry": {} });
const device = { id: "agent-a", store_id: "store-a", bay_id: "bay-a", label: "A", is_active: true,
  pc_name: "PC", token_hash: auth.hashAgentToken("valid"), game_telemetry: { large: "x".repeat(8192) } };
const request = (token) => ({ headers: { get: () => token ? `Bearer ${token}` : null } });
const authDb = database([device]);
assert.equal((await auth.getAgentByToken(authDb, request(null))).agent, null);
assert.equal(authDb.queries.length, 0);
assert.equal((await auth.getAgentByToken(authDb, request("wrong"))).agent, null);
const accepted = await auth.getAgentByToken(authDb, request("valid"));
assert.equal(accepted.agent.store_id, "store-a");
assert.equal(accepted.agent.bay_id, "bay-a");
assert.equal(authDb.queries.at(-1).columns, "id, store_id, bay_id, label, is_active, pc_name");
assert.equal("game_telemetry" in accepted.agent, false);
assert.equal("token_hash" in accepted.agent, false);
device.is_active = false;
assert.equal((await auth.getAgentByToken(authDb, request("valid"))).agent, null, "revocation must be checked on every request");
assert.equal((await auth.getAgentByToken(database([], { failRead: true }), request("valid"))).agent, null);

const agentCommands = load("src/lib/agent-commands.ts");
function command(type, overrides = {}) {
  return { id: "command-a", store_id: "store-a", bay_id: "bay-a", command_type: type,
    status: "pending", created_at: new Date().toISOString(), attempts: 2,
    access_session_id: "session-a", reservation_id: "reservation-a", payload: { scripts: [{ script: "bay_on" }], detail: "x".repeat(4096) }, ...overrides };
}
for (const loseClaim of [false, true]) {
  const row = command("shutdown_pc");
  const foreign = command("shutdown_pc", { id: "foreign", store_id: "other" });
  const db = database([row, foreign], { loseClaim });
  const result = await agentCommands.claimShutdownCommand(db, device);
  assert.equal(db.queries.find((q) => !q.patch).columns, "id, attempts");
  assert.equal(result.length, loseClaim ? 0 : 1);
  if (!loseClaim) {
    assert.equal(result[0].payload, row.payload);
    assert.equal(row.attempts, 3);
  }
  assert.equal(foreign.status, "pending");
}

function controller(db, authorized = true) {
  return load("src/app/api/store-controller/commands/route.ts", {
    "next/server": { NextResponse: { json: (data, options = {}) => ({ data, status: options.status ?? 200 }) } },
    "@/lib/supabase/server": { createSupabaseAdminClient: () => db },
    "@/lib/store-controller-auth": { readBearerToken: () => "token", resolveControllerAuth: async () => ({ ok: authorized, storeId: "store-a", scoped: true }) },
    "@/lib/reservation-prepare": {}, "@/lib/session-cleanup": {}, "@/lib/store-automation-schedule": {},
    "@/lib/poll-maintenance": { runPollMaintenance: async () => null }
  });
}
const controllerRequest = { headers: { get: () => null }, nextUrl: { searchParams: new URLSearchParams() } };
for (const loseClaim of [false, true]) {
  const row = command("run_scripts");
  const foreign = command("run_scripts", { id: "foreign", store_id: "other" });
  const shutdown = command("shutdown_pc", { id: "agent-only" });
  const db = database([row, foreign, shutdown], { loseClaim });
  const response = await controller(db).GET(controllerRequest);
  assert.equal(response.status, 200);
  assert.equal(db.queries.find((q) => !q.patch).columns, "id, attempts");
  assert.equal(response.data.commands.length, loseClaim ? 0 : 1);
  if (!loseClaim) {
    const delivered = response.data.commands[0];
    assert.equal(delivered.payload, row.payload);
    assert.equal(delivered.bayId, row.bay_id);
    assert.equal(delivered.accessSessionId, row.access_session_id);
    assert.equal(delivered.reservationId, row.reservation_id);
    assert.equal(delivered.attempt, 3);
  }
  assert.equal(foreign.status, "pending");
  assert.equal(shutdown.status, "pending");
}
const deniedDb = database([]);
assert.equal((await controller(deniedDb, false).GET(controllerRequest)).status, 401);
assert.equal(deniedDb.queries.length, 0);
assert.equal((await controller(database([], { failRead: true })).GET(controllerRequest)).status, 500);
console.log("Polling egress: narrow uncached auth, minimal candidates, payload delivery, claim races, store isolation, and read failures passed");
