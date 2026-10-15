import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(file, modules = {}) {
  const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, Date, Error, console, require(name) {
    assert.ok(name in modules, `Unexpected import: ${name}`);
    return modules[name];
  } });
  return exports;
}
const { SONGDO_STORE_ID } = load("src/lib/automation/device-map.ts");
const errors = load("src/lib/supabase/reservation-errors.ts");
const storeA = "11111111-1111-4111-8111-111111111111";
const storeB = "22222222-2222-4222-8222-222222222222";
const idA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const idB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const idNew = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const draft = { storeId: storeA, starts_at: "2026-10-15T01:30:00.000Z", guest_name: " Guest ",
  bay_code: " a-01 ", party_size: "2", channel: "admin", status: "requested", approval_policy: "자동 확정", memo: " Note " };
const plain = (value) => JSON.parse(JSON.stringify(value));

function database() {
  const rows = [
    { id: idA, store_id: storeA, bay_id: "bay-a", starts_at: "2026-10-14T01:00:00Z", guest_name: "A", party_size: 1,
      channel: "admin", status: "requested", approval_required: false, memo: null },
    { id: idB, store_id: storeB, bay_id: "bay-b", starts_at: "2026-10-15T01:00:00Z", guest_name: "B", party_size: 1,
      channel: "admin", status: "confirmed", approval_required: false, memo: null }
  ];
  const bays = [{ id: "bay-b", store_id: storeB, bay_code: "A-01" },
    { id: "bay-a", store_id: storeA, bay_code: "A-01" }, { id: "foreign-only", store_id: storeB, bay_code: "B-01" }];
  const db = { rows, bays, queries: [], writes: 0, failure: null, throws: false, from(table) {
    assert.ok(["reservations", "bays"].includes(table));
    const record = { table, filters: [], action: "select", values: null, columns: null, order: null };
    db.queries.push(record);
    const query = {
      select(columns) { record.columns = columns; return this; },
      eq(key, value) { record.filters.push([key, value]); return this; },
      order(key, options) { record.order = [key, options]; return this; },
      insert(values) { record.action = "insert"; record.values = plain(values); return this; },
      update(values) { record.action = "update"; record.values = plain(values); return this; },
      delete() { record.action = "delete"; return this; },
      async maybeSingle() { return execute(true); },
      then(resolve, reject) { return Promise.resolve().then(() => execute(false)).then(resolve, reject); }
    };
    function execute(single) {
      if (db.throws) throw new Error("mock database exception");
      if (db.failure) return { data: null, error: db.failure };
      if (record.action === "insert") assert.ok([storeA, storeB].includes(record.values.store_id));
      else assert.ok(record.filters.some(([key]) => key === "store_id"), "Every lookup/mutation must be store-scoped");
      if (["update", "delete"].includes(record.action)) {
        assert.ok(record.filters.some(([key]) => key === "id"));
        assert.equal(record.columns, "id");
      }
      if (table === "bays") assert.ok(record.filters.some(([key]) => key === "bay_code"));
      const source = table === "bays" ? bays : rows;
      let matches = source.filter((row) => record.filters.every(([key, value]) => row[key] === value));
      if (record.action === "insert") {
        const row = { id: idNew, ...record.values };
        rows.push(row); matches = [row]; db.writes++;
      } else if (record.action === "update") {
        matches.forEach((row) => Object.assign(row, record.values)); db.writes += matches.length;
      } else if (record.action === "delete") {
        matches.forEach((row) => rows.splice(rows.indexOf(row), 1)); db.writes += matches.length;
      }
      if (record.order) {
        assert.equal(record.order[0], "starts_at");
        assert.equal(record.order[1].ascending, false);
        matches.sort((a, b) => b.starts_at.localeCompare(a.starts_at));
      }
      const projected = matches.map((row) => Object.fromEntries(record.columns.split(",").map((key) =>
        key === "bays(bay_code)" ? ["bays", bays.find((bay) => bay.id === row.bay_id) ? { bay_code: bays.find((bay) => bay.id === row.bay_id).bay_code } : null] : [key, row[key]])));
      return { data: single ? projected[0] ?? null : projected, error: null };
    }
    return query;
  } };
  return db;
}

function routes(db, storeId = storeA, factoryThrows = false) {
  const calls = { clients: 0, auth: 0 };
  const route = load("src/app/api/admin/reservations/route.ts", {
    "next/server": { NextResponse: { json: (data, options = {}) => ({ data: plain(data), status: options.status ?? 200 }) } },
    "@/lib/admin-context": { getAdminContext: async () => {
      calls.auth++; if (!storeId) throw new Error("unauthorized"); return { storeId };
    } },
    "@/lib/automation/device-map": { SONGDO_STORE_ID },
    "@/lib/supabase/reservation-errors": errors,
    "@/lib/supabase/server": { createSupabaseAdminClient: () => {
      calls.clients++; if (factoryThrows) throw new Error("mock configuration failure"); return db;
    } }
  });
  return { route, calls };
}
const request = (body = draft, storeId = body?.storeId) => ({
  nextUrl: new URL(`https://example.test/api/admin/reservations${storeId === undefined ? "" : `?storeId=${encodeURIComponent(storeId)}`}`),
  json: async () => body
});

for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
  for (const storeId of [storeB, undefined, ` ${storeA}`, ""]) {
    const db = database(); const { route, calls } = routes(db);
    const result = await route[method](request({ ...draft, storeId, id: idA }));
    assert.equal(result.status, 403, `${method} rejects missing/mismatched store`);
    assert.equal(calls.clients, 0); assert.equal(db.queries.length, 0);
  }
  const db = database(); const { route, calls } = routes(db, null);
  assert.equal((await route[method](request({ ...draft, id: idA }))).status, 401);
  assert.equal(calls.clients, 0); assert.equal(db.queries.length, 0);
}

for (const method of ["POST", "PATCH", "DELETE"]) {
  for (const value of [null, [], "text", 1, true]) {
    const db = database(); const { route, calls } = routes(db);
    assert.equal((await route[method](request(value))).status, 400);
    assert.equal(calls.clients, 0);
  }
  const db = database(); const { route, calls } = routes(db);
  assert.equal((await route[method]({ json: async () => { throw new SyntaxError("invalid JSON"); } })).status, 400);
  assert.equal(calls.clients, 0);
}

const invalid = [
  { starts_at: "bad" }, { starts_at: "2026-10-15T10:30" }, { starts_at: "2026-02-30T01:00:00Z" },
  { starts_at: "2026-10-15T24:00:00Z" }, { starts_at: "2026-10-15T01:60:00Z" },
  { guest_name: " " }, { guest_name: 1 }, { guest_name: "a".repeat(201) },
  ...[0, 9, -1, 1.5, "2x", null, true, {}, " "].map((party_size) => ({ party_size })),
  { channel: "forged" }, { channel: null }, { status: "forged" }, { approval_policy: "forged" },
  { memo: [] }, { memo: "a".repeat(5001) }, { bay_code: 1 }, { bay_code: "a".repeat(51) }
];
for (const method of ["POST", "PATCH"]) {
  for (const extra of invalid) {
    const db = database(); const { route, calls } = routes(db);
    assert.equal((await route[method](request({ ...draft, id: idA, ...extra }))).status, 400, `${method}: ${JSON.stringify(extra).slice(0, 120)}`);
    assert.equal(calls.clients, 0); assert.equal(db.writes, 0);
  }
  for (const bay_code of ["MISSING", "b-01"]) {
    const db = database(); const { route } = routes(db);
    assert.equal((await route[method](request({ ...draft, id: idA, bay_code }))).status, 400);
    assert.equal(db.writes, 0); assert.equal(db.queries.length, 1);
  }
}
for (const method of ["PATCH", "DELETE"]) {
  for (const id of [undefined, "bad", null, 12]) {
    const db = database(); const { route, calls } = routes(db);
    assert.equal((await route[method](request({ ...draft, id }))).status, 400);
    assert.equal(calls.clients, 0);
  }
  const db = database(); const before = plain(db.rows); const { route } = routes(db);
  assert.equal((await route[method](request({ ...draft, id: idB }))).status, 404);
  assert.deepEqual(db.rows, before); assert.equal(db.writes, 0);
}

const songdoDb = database();
songdoDb.rows.push(...[idA, idB].map((id) => ({ id, store_id: SONGDO_STORE_ID })));
const songdoBefore = plain(songdoDb.rows);
const songdo = routes(songdoDb, SONGDO_STORE_ID);
assert.deepEqual((await songdo.route.GET(request({ storeId: SONGDO_STORE_ID }))).data, { ok: true, storeId: SONGDO_STORE_ID, rows: [] });
for (const method of ["POST", "PATCH", "DELETE"]) {
  const result = await songdo.route[method](request({ ...draft, storeId: SONGDO_STORE_ID, id: idA }));
  assert.equal(result.status, 409); assert.match(result.data.message, /VISTA 예약 미사용/);
}
assert.equal(songdo.calls.clients, 0); assert.equal(songdoDb.queries.length, 0); assert.deepEqual(songdoDb.rows, songdoBefore);

const db = database(); const { route } = routes(db);
const foreign = plain(db.rows[1]);
const listing = await route.GET(request());
assert.deepEqual(listing.data, { ok: true, storeId: storeA, rows: [{ id: idA, starts_at: db.rows[0].starts_at,
  guest_name: "A", party_size: 1, channel: "admin", status: "requested", approval_required: false, memo: null, bays: { bay_code: "A-01" } }] });
assert.equal(db.queries[0].columns, "id,starts_at,guest_name,party_size,channel,status,approval_required,memo,bays(bay_code)");
assert.equal((await route.POST(request({ ...draft, store_id: storeB, bay_id: "bay-b", ends_at: "2099-01-01T00:00:00Z" }))).data.id, idNew);
const created = db.rows.find((row) => row.id === idNew);
assert.equal(created.store_id, storeA); assert.equal(created.bay_id, "bay-a");
assert.equal(created.guest_name, "Guest"); assert.equal(created.memo, "Note");
assert.equal(created.ends_at, "2026-10-15T02:30:00.000Z");
assert.equal(created.party_size, 2);
assert.deepEqual((await route.GET(request())).data.rows.map((row) => row.id), [idNew, idA]);
assert.deepEqual((await route.PATCH(request({ ...draft, id: idA, bay_code: "", party_size: "", channel: "", status: "", approval_policy: "", memo: "" }))).data,
  { ok: true, storeId: storeA, id: idA });
const updated = db.rows.find((row) => row.id === idA);
assert.equal(updated.bay_id, null); assert.equal(updated.party_size, 1); assert.equal(updated.channel, "admin");
assert.equal(updated.status, "requested"); assert.equal(updated.approval_required, false); assert.equal(updated.memo, null);
assert.equal((await route.PATCH(request({ ...draft, id: idA, approval_policy: "매장 승인", party_size: 8 }))).status, 200);
assert.equal(updated.approval_required, true); assert.equal(updated.party_size, 8);
assert.deepEqual((await route.DELETE(request({ storeId: storeA, id: idA }))).data, { ok: true, storeId: storeA, id: idA });
assert.equal(db.rows.some((row) => row.id === idA), false);
assert.equal((await route.DELETE(request({ storeId: storeA, id: idA }))).status, 404);
assert.deepEqual(db.rows.find((row) => row.id === idB), foreign);

// The context can be any supported store, not a hardcoded default store.
const secondDb = database(); const second = routes(secondDb, storeB);
assert.deepEqual((await second.route.GET(request({ storeId: storeB }))).data.rows.map((row) => row.id), [idB]);
assert.equal((await second.route.POST(request({ ...draft, storeId: storeB, starts_at: "2026-10-15T10:30:00+09:00" }))).status, 200);
const secondCreated = secondDb.rows.find((row) => row.id === idNew);
assert.equal(secondCreated.store_id, storeB); assert.equal(secondCreated.bay_id, "bay-b");
assert.equal(secondCreated.starts_at, draft.starts_at);
assert.equal((await second.route.PATCH(request({ ...draft, storeId: storeB, id: idB }))).status, 200);
assert.equal(secondDb.rows.find((row) => row.id === idB).bay_id, "bay-b");
assert.equal((await second.route.DELETE(request({ storeId: storeB, id: idB }))).status, 200);
assert.equal(secondDb.rows.find((row) => row.id === idA).guest_name, "A");

for (const method of ["POST", "PATCH"]) {
  const bayFailureDb = database(); bayFailureDb.failure = { message: "bay lookup failed" };
  assert.equal((await routes(bayFailureDb).route[method](request({ ...draft, id: idA }))).status, 500);
  assert.equal(bayFailureDb.writes, 0);
}

for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
  for (const mode of ["query", "throw", "factory", "overlap"]) {
    const failingDb = database();
    if (mode === "query") failingDb.failure = { message: "mock secret database error", code: "XX000" };
    if (mode === "throw") failingDb.throws = true;
    if (mode === "overlap") failingDb.failure = { message: "raw exclusion", code: "23P01" };
    const failing = routes(failingDb, storeA, mode === "factory");
    const result = await failing.route[method](request({ ...draft, id: idA, bay_code: "" }));
    assert.equal(result.status, mode === "overlap" ? 409 : 500);
    assert.equal(result.data.ok, false);
    if (mode === "overlap") assert.equal(result.data.message, errors.toReservationErrorMessage({ code: "23P01" }));
    else assert.ok(!result.data.message.includes("secret"));
  }
}
console.log("Reservation route checks passed: authentication, exact store scope, scoped bay lookup, ID attacks, Songdo no-CRUD, validation, CRUD/defaults, errors (mock DB only).");
