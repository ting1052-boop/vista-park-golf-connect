import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const now = Date.parse("2026-10-14T01:00:00Z");
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
function load(file, modules = {}) {
  const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, Date: FixedDate, Error, Buffer, console, require(name) {
    assert.ok(name in modules, `Unexpected import: ${name}`);
    return modules[name];
  } });
  return exports;
}
const { SONGDO_STORE_ID } = load("src/lib/automation/device-map.ts");
const protocol = load("src/lib/agent-observer-protocol.ts", {
  "@/lib/automation/device-map": { SONGDO_STORE_ID }
});
const commands = load("src/lib/agent-commands.ts");
const agent = { id: "agent-a", store_id: SONGDO_STORE_ID, bay_id: "bay-a" };
const iso = (delta) => new Date(now + delta).toISOString();
const row = (id, extra = {}) => ({ id, store_id: agent.store_id, bay_id: agent.bay_id,
  command_type: "shutdown_pc", status: "pending", created_at: iso(-1000), attempts: 0, payload: null, ...extra });

function database(rows = [], failAt = 0, loseClaim = false, scope = agent) {
  const queries = [];
  const dataByTable = {};
  return { rows, queries, dataByTable, from(table) {
    const record = { table, filters: [], update: null };
    queries.push(record);
    const index = queries.length;
    let ordering = null;
    let count = Infinity;
    const query = {
      select() { return this; },
      update(value) { record.update = value; return this; },
      eq(key, value) { record.filters.push(["eq", key, value]); return this; },
      lt(key, value) { record.filters.push(["lt", key, value]); return this; },
      gte(key, value) { record.filters.push(["gte", key, value]); return this; },
      in() { return this; }, not() { return this; },
      order(key, options) { ordering = [key, options.ascending]; return this; },
      limit(value) { count = value; return this; },
      async maybeSingle() { return execute(true); },
      then(resolve, reject) { return Promise.resolve(execute(false)).then(resolve, reject); }
    };
    function execute(single) {
      if (index === failAt) return { data: null, error: { message: "mock command failure" } };
      if (table !== "store_controller_commands") return { data: dataByTable[table] ?? null, error: null };
      for (const [key, value] of [["store_id", scope.store_id], ["bay_id", scope.bay_id], ["command_type", "shutdown_pc"]]) {
        assert.ok(record.filters.some(([op, k, v]) => op === "eq" && k === key && v === value));
      }
      let matches = rows.filter((item) => record.filters.every(([op, key, value]) =>
        op === "eq" ? item[key] === value : op === "lt" ? item[key] != null && item[key] < value : item[key] >= value));
      if (ordering) matches.sort((a, b) => a[ordering[0]].localeCompare(b[ordering[0]]) * (ordering[1] ? 1 : -1));
      matches = matches.slice(0, count);
      if (loseClaim && record.update?.status === "processing") matches = [];
      if (record.update) matches.forEach((item) => Object.assign(item, record.update));
      return { data: single ? matches[0] ?? null : matches, error: null };
    }
    return query;
  } };
}

function routes(db, authenticatedAgent = agent) {
  const calls = { touch: 0, settings: 0, events: [] };
  const eventModule = (kind) => ({
    [`normalizeAgent${kind}Events`]: (events) => events,
    [`storeAgent${kind}Events`]: async (_db, scope, events) => {
      assert.equal(scope, authenticatedAgent);
      calls.events.push(kind);
      return { acknowledgedIds: events.map((event) => event.eventId), rejected: [], retryable: false };
    }
  });
  const modules = {
    "next/server": { NextResponse: { json: (data, options = {}) => ({ data: JSON.parse(JSON.stringify(data)), status: options.status ?? 200 }) } },
    "@/lib/supabase/server": { createSupabaseAdminClient: () => db },
    "@/lib/agent-server": {
      getAgentByToken: async () => ({ agent: authenticatedAgent, error: "unauthorized" }),
      touchAgent: async () => { calls.touch++; },
      getStoreExtensionSettings: async () => { calls.settings++; return { extension_notice_minutes: 10, extension_minutes: 30, extension_price: 6000 }; },
      storeAgentGameTelemetry: async () => ({ stored: true })
    },
    "@/lib/agent-round-events": eventModule("Round"),
    "@/lib/agent-usage-events": eventModule("Usage"),
    "@/lib/game-telemetry": { normalizeGameTelemetry: (value) => value },
    "@/lib/agent-commands": commands,
    "@/lib/agent-observer-protocol": protocol
  };
  return { calls, session: load("src/app/api/agent/session/route.ts", modules).GET,
    heartbeat: load("src/app/api/agent/heartbeat/route.ts", modules).POST };
}
const request = (body = {}, header = null) => ({ headers: { get: (name) => name === "x-vista-observer-protocol" ? header : null }, text: async () => JSON.stringify(body) });

// Only the authenticated store and exact version may negotiate.
for (const version of [undefined, null, "1", true, 0, 2]) assert.equal(protocol.getAgentObserverPolicy(agent, version), null);
assert.equal(protocol.getAgentObserverPolicy({ store_id: "other-store" }, 1), null);
assert.equal(protocol.getAgentObserverPolicy(agent, 1).pollIntervalSeconds, 60);

const db = database([row("foreign-store", { store_id: "other-store" }), row("foreign-bay", { bay_id: "other-bay" }),
  row("expired", { created_at: iso(-300001) }), row("recovered", { status: "processing", created_at: iso(-2000), lease_expires_at: iso(-1), attempts: 2 }),
  row("leased", { status: "processing", lease_expires_at: iso(1) }), row("other-command", { command_type: "run_scripts" })]);
const claimed = await commands.claimShutdownCommand(db, agent);
assert.equal(claimed[0].id, "recovered");
assert.equal(db.rows.find((item) => item.id === "recovered").lease_expires_at, iso(120000));
assert.equal(db.rows.find((item) => item.id === "recovered").controller_id, "agent:agent-a");
assert.equal(db.rows.find((item) => item.id === "recovered").attempts, 3);
assert.equal(db.rows.find((item) => item.id === "expired").status, "cancelled");
for (const id of ["foreign-store", "foreign-bay", "other-command"]) assert.equal(db.rows.find((item) => item.id === id).status, "pending");
assert.equal(db.rows.find((item) => item.id === "leased").status, "processing");
assert.equal(db.queries[2].filters.find(([op, key]) => op === "gte" && key === "created_at")[2], iso(-300000));
assert.equal((await commands.claimShutdownCommand(database([row("race")], 0, true), agent)).length, 0);
const boundary = database([row("ttl-boundary", { created_at: iso(-300000) }), row("lease-boundary", { status: "processing", lease_expires_at: iso(0) })]);
assert.equal((await commands.claimShutdownCommand(boundary, agent))[0].id, "ttl-boundary");
assert.equal(boundary.rows[1].status, "processing");

const negotiatedDb = database([row("heartbeat-only")]);
const negotiated = routes(negotiatedDb);
const session = await negotiated.session(request({}, "1"));
assert.deepEqual(session.data, { ok: true, session: null, commands: [], observerPolicy: { protocol: 1, pollIntervalSeconds: 60 } });
assert.equal(negotiatedDb.queries.length, 0);
assert.equal(negotiated.calls.settings, 0);
const heartbeat = await negotiated.heartbeat(request({ observerProtocol: 1, storeId: "forged", accessSessionId: "ignored", remainingSeconds: 10,
  roundEvents: [{ eventId: "round-a" }], usageEvents: [{ eventId: "usage-a" }], gameTelemetry: {} }));
assert.equal(heartbeat.data.commands[0].id, "heartbeat-only");
assert.deepEqual(heartbeat.data.roundEventAckIds, ["round-a"]);
assert.deepEqual(heartbeat.data.usageEventAckIds, ["usage-a"]);
assert.equal(heartbeat.data.gameTelemetryAccepted, true);
assert.ok(negotiatedDb.queries.every((query) => query.table === "store_controller_commands"));
assert.equal(negotiated.calls.touch, 2);
const repeatHeartbeat = await negotiated.heartbeat(request({ observerProtocol: 1 }));
assert.deepEqual(repeatHeartbeat.data.commands, []);
assert.equal(negotiatedDb.rows[0].attempts, 1);

for (const [store, header] of [[SONGDO_STORE_ID, null], [SONGDO_STORE_ID, "2"], ["other-store", "1"]]) {
  const scope = { ...agent, store_id: store };
  const legacyDb = database([], 0, false, scope);
  const legacy = routes(legacyDb, scope);
  const result = await legacy.session(request({}, header));
  assert.equal(result.status, 200);
  assert.ok(result.data.policy);
  assert.equal(result.data.observerPolicy, undefined);
  assert.equal(legacy.calls.settings, 1);
  assert.ok(legacyDb.queries.some((query) => query.table === "access_sessions"));
}
for (const [store, version] of [[SONGDO_STORE_ID, undefined], [SONGDO_STORE_ID, "1"], ["other-store", 1]]) {
  const legacyDb = database();
  const legacy = routes(legacyDb, { ...agent, store_id: store });
  const result = await legacy.heartbeat(request({ observerProtocol: version, storeId: SONGDO_STORE_ID, accessSessionId: "session-a", remainingSeconds: 10 }));
  assert.equal(result.data.observerPolicy, undefined);
  assert.equal(result.data.commands, undefined);
  assert.deepEqual(legacyDb.queries.map((query) => query.table), ["access_sessions"]);
}

const activeDb = database([row("legacy-command")]);
activeDb.dataByTable.access_sessions = { id: "active-session", guest_name: null, status: "active", started_at: iso(-60000),
  ends_at: iso(120000), reservation_id: "reservation-a", reservations: [{ guest_name: "Guest", guest_phone_last4: "1234" }] };
const active = routes(activeDb);
const activeSession = await active.session(request());
assert.equal(activeSession.data.commands[0].id, "legacy-command");
assert.equal(activeSession.data.session.customerLabel, "Guest / ****-1234");
assert.equal(activeSession.data.session.remainingSeconds, 120);
const activeHeartbeat = await active.heartbeat(request({ accessSessionId: "active-session", remainingSeconds: 12.9, screenLocked: true }));
assert.equal(activeHeartbeat.status, 200);
const sessionLookup = activeDb.queries.find((query) => query.table === "access_sessions" && query.filters.some(([, key]) => key === "store_id"));
assert.ok(sessionLookup.filters.some(([, key, value]) => key === "store_id" && value === agent.store_id));
assert.ok(sessionLookup.filters.some(([, key, value]) => key === "bay_id" && value === agent.bay_id));
const kioskUpdate = activeDb.queries.find((query) => query.table === "kiosk_sessions");
assert.deepEqual(JSON.parse(JSON.stringify(kioskUpdate.update)), { remaining_seconds: 12, is_locked: true, locked_at: iso(0) });

// Failures in every command phase still return already persisted event ACKs.
for (let failAt = 1; failAt <= 4; failAt++) {
  const failing = routes(database([row("failure")], failAt));
  const result = await failing.heartbeat(request({ observerProtocol: 1, roundEvents: [{ eventId: "saved-round" }], usageEvents: [{ eventId: "saved-usage" }] }));
  assert.equal(result.status, 500);
  assert.equal(result.data.ok, false);
  assert.equal(result.data.message, "mock command failure");
  assert.deepEqual(result.data.roundEventAckIds, ["saved-round"]);
  assert.deepEqual(result.data.usageEventAckIds, ["saved-usage"]);
  assert.deepEqual(result.data.commands, []);
  assert.equal(result.data.observerPolicy.protocol, 1);
}
const oldError = await routes(database([], 3)).session(request());
assert.equal(oldError.status, 500);
for (const endpoint of ["session", "heartbeat"]) {
  const unauthorizedDb = database();
  const unauthorized = routes(unauthorizedDb, null);
  assert.equal((await unauthorized[endpoint](request({ observerProtocol: 1 }, "1"))).status, 401);
  assert.equal(unauthorized.calls.touch, 0);
  assert.equal(unauthorizedDb.queries.length, 0);
}
for (const [text, status] of [["not-json", 400], [JSON.stringify({ padding: "a".repeat(32768) }), 413]]) {
  const invalidDb = database();
  const invalid = routes(invalidDb);
  assert.equal((await invalid.heartbeat({ text: async () => text })).status, status);
  assert.equal(invalid.calls.touch, 0);
  assert.equal(invalidDb.queries.length, 0);
}
console.log("Agent observer protocol checks passed: scope, legacy clients, lease/TTL boundaries, single command endpoint, no session queries, error ACKs, authentication (mock DB only).");
