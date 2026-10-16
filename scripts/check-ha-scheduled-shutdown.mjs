import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as crypto from "node:crypto";

function load(file, modules = {}, date = Date) {
  const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, Buffer, Date: date, require(name) {
    assert.ok(name in modules, `Unexpected import: ${name}`);
    return modules[name];
  } });
  return exports;
}
const { SONGDO_STORE_ID } = load("src/lib/automation/device-map.ts");
const auth = load("src/lib/store-controller-auth.ts", { crypto });
const config = () => ({ mode: "zones", schedules: [
  { id: "golf", name: "Golf", enabled: false, bayIds: ["a1"], closeBayIds: ["a1"],
    openTime: "05:50", closeTime: "23:20", lastOpenedOn: null, lastClosedOn: null },
  { id: "park", name: "Park", enabled: false, bayIds: ["p1"], closeBayIds: ["p1"],
    openTime: "09:50", closeTime: "21:20", lastOpenedOn: null, lastClosedOn: null }
] });
const bays = () => [
  ...Array.from({ length: 7 }, (_, i) => ({ id: `a${i + 1}`, bay_code: ` a-0${i + 1} ` })),
  { id: "p1", bay_code: "P01" }, { id: "p2", bay_code: "P-02" },
  { id: "excluded", bay_code: "A-08" }
];
let checks = 0;
async function run(options = {}) {
  const state = { config: config(), queues: [], updates: [], lookups: 0, ...options };
  const before = structuredClone(state.config);
  const db = { from(table) {
    const filters = [];
    let update;
    const query = {
      select() { return this; },
      eq(key, value) { filters.push([key, value]); return this; },
      update(value) { update = value; return this; },
      async maybeSingle() { return execute(); },
      then(resolve, reject) { return Promise.resolve(execute()).then(resolve, reject); }
    };
    function execute() {
      if (table === "store_controller_tokens") {
        state.lookups++;
        assert.ok(filters.some(([key, value]) => key === "is_active" && value === true));
        assert.ok(filters.some(([key, value]) => key === "token_hash" && value === auth.hashControllerToken(options.token ?? "test-store-token")));
        if (options.lookupError) return { data: null, error: { message: "sensitive failure" } };
        return { data: options.invalidToken ? null : { store_id: options.tokenStore ?? SONGDO_STORE_ID }, error: null };
      }
      assert.ok(filters.some(([key, value]) => key === "store_id" && value === SONGDO_STORE_ID));
      if (table === "bays") return { data: options.bays ?? bays(), error: options.bayError ? { message: "secret" } : null };
      assert.equal(table, "store_settings");
      const configFilter = filters.find(([key]) => key === "automation_schedule_config");
      assert.ok(configFilter, "CAS must compare the original config");
      assert.equal(typeof configFilter[1], "string", "PostgREST eq interpolates values into a URL");
      assert.deepEqual(JSON.parse(configFilter[1]), state.config);
      state.updates.push(JSON.parse(JSON.stringify(update)));
      return { data: options.conflict ? null : { store_id: SONGDO_STORE_ID }, error: options.saveError ? { message: "secret" } : null };
    }
    return query;
  } };
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [options.now ?? "2026-10-16T14:20:00Z"])); }
  }
  const route = load("src/app/api/store-controller/scheduled-shutdown/route.ts", {
    "next/server": { NextResponse: { json(data, init = {}) { return { status: init.status ?? 200, data }; } } },
    "@/lib/supabase/server": { createSupabaseAdminClient: () => db },
    "@/lib/store-controller-auth": options.unscoped ? { ...auth, resolveControllerAuth: async () => ({ ok: true, scoped: false, storeId: SONGDO_STORE_ID }) } : {
      ...auth, resolveControllerAuth: async (args) => {
        assert.equal(args.globalToken, undefined);
        return auth.resolveControllerAuth(args);
      }
    },
    "@/lib/automation/device-map": { SONGDO_STORE_ID },
    "@/lib/store-automation-schedule": { getStoreAutomationSchedule: async (client, store) => {
      assert.equal(client, db); assert.equal(store, SONGDO_STORE_ID);
      return { config: state.config, custom: options.custom ?? true, timezone: options.timezone ?? "Asia/Seoul" };
    } },
    "@/lib/store-controller": { enqueueStoreClosure: async (client, store, origin, args) => {
      assert.equal(client, db); assert.equal(store, SONGDO_STORE_ID);
      assert.match(origin, /^ha_scheduled_close:(golf|park)$/);
      assert.equal(args.includeEquipment, false);
      assert.deepEqual(Object.keys(args).sort(), ["group", "includeEquipment"]);
      state.queues.push(JSON.parse(JSON.stringify(args)));
      if (options.queueError) throw new Error("secret");
      return options.result ?? { blocked: false, agentShutdown: { queued: 7, reused: 0 } };
    } }
  }, FixedDate);
  const headers = { authorization: options.noToken ? null : `Bearer ${options.token ?? "test-store-token"}`,
    "x-store-id": options.headerStore ?? null };
  const response = await route.POST({ headers: { get: (key) => headers[key] ?? null }, json: async () => {
    if (options.badJson) throw new Error("secret");
    return options.body === undefined ? { group: "golf" } : options.body;
  } });
  assert.equal(response.status, options.status ?? 200);
  assert.doesNotMatch(JSON.stringify(response.data), /secret|sensitive|test-store-token/);
  assert.deepEqual(state.config, before, "Original config must not be mutated");
  if (options.noQueue) assert.equal(state.queues.length, 0);
  if (options.noWrite) assert.equal(state.updates.length, 0);
  checks++;
  return { response, state, before };
}

await run({ noToken: true, status: 401, noQueue: true, noWrite: true });
await run({ invalidToken: true, status: 401, noQueue: true });
await run({ token: "mock-legacy-global-token", invalidToken: true, status: 401, noQueue: true });
await run({ lookupError: true, status: 401, noQueue: true });
for (const tokenStore of ["11111111-1111-4111-8111-111111111111", "other-store"]) {
  await run({ tokenStore, status: 403, noQueue: true });
}
await run({ unscoped: true, status: 403, noQueue: true });
await run({ headerStore: "other-store", status: 403, noQueue: true });
await run({ body: { group: "golf", storeId: "other-store" }, status: 403, noQueue: true });
for (const body of [null, [], {}, { group: "all" }, { group: "golf", dryRun: "true" },
  { group: "golf", bayIds: ["foreign"] }, { group: "golf", force: true }]) {
  await run({ body, status: 400, noQueue: true });
}
await run({ badJson: true, status: 400, noQueue: true });
for (const options of [{ custom: false }, { timezone: "UTC" },
  { config: { ...config(), mode: "store" } }, { config: { ...config(), schedules: [] } },
  { config: { ...config(), schedules: [config().schedules[0], config().schedules[0]] } },
  { config: { ...config(), schedules: [{ ...config().schedules[0], closeTime: "24:00" }] } }]) {
  await run({ ...options, status: 400, noQueue: true, noWrite: true });
}
await run({ bayError: true, status: 503, noQueue: true });
await run({ bays: bays().slice(1), status: 400, noQueue: true });
await run({ bays: [...bays(), { id: "duplicate", bay_code: "A01" }], status: 400, noQueue: true });
const dry = await run({ body: { group: "park", dryRun: true }, now: "2026-10-16T00:00:00Z", noQueue: true, noWrite: true });
assert.deepEqual(Array.from(dry.response.data.bayIds), ["p1", "p2"]);
assert.equal(dry.response.data.dryRun, true);
for (const now of ["2026-10-16T14:19:59Z", "2026-10-16T14:30:01Z", "2026-10-16T15:00:00Z"]) {
  await run({ now, status: 403, noQueue: true, noWrite: true });
}
const success = await run();
assert.deepEqual(success.state.queues[0].group, ["a1", "a2", "a3", "a4", "a5", "a6", "a7"]);
const expected = structuredClone(success.before);
expected.schedules[0].lastClosedOn = "2026-10-16";
assert.deepEqual(success.state.updates, [{ automation_schedule_config: expected }]);
await run({ now: "2026-10-16T14:30:00Z" });
const park = await run({ body: { group: "park" }, now: "2026-10-16T12:25:00Z" });
assert.deepEqual(park.state.queues[0].group, ["p1", "p2"]);
const closed = config(); closed.schedules[0].lastClosedOn = "2026-10-16";
const repeat = await run({ config: closed, noQueue: true, noWrite: true });
assert.equal(repeat.response.data.alreadyClosed, true);
await run({ config: closed, now: "2026-10-16T01:00:00Z", status: 403, noQueue: true });
await run({ result: { blocked: true }, status: 409, noWrite: true });
await run({ result: { blocked: false, agentShutdown: { queued: 0, reused: 0 } }, status: 503, noWrite: true });
await run({ result: { blocked: false, agentShutdown: { queued: 0, reused: 2 } } });
await run({ queueError: true, status: 503, noWrite: true });
await run({ saveError: true, status: 503 });
await run({ conflict: true, status: 503 });
console.log(`HA scheduled shutdown: ${checks} mocked route checks passed. No network or power actions.`);
