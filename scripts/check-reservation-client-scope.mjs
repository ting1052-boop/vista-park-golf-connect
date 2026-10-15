import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
function load(file, modules, extra = "") {
  const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source + extra, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, Date, Error, encodeURIComponent, ...modules.globals,
    require: name => name in modules ? modules[name] : require(name) });
  return exports;
}
const storeId = "store-current";
const requests = [];
let result = { ok: true, storeId, rows: [] };
let status = true;
const crud = load("src/components/admin-crud-page.tsx", {
  "@/lib/supabase/client": { createBrowserSupabaseClient() { throw new Error("Unexpected browser DB access"); } },
  globals: { fetch: async (url, options) => {
    requests.push({ url, options });
    return { ok: status, json: async () => result };
  } }
}, "\nexport { reservationRequest, toIsoFromLocal };\n");
await assert.rejects(crud.reservationRequest(undefined), /매장/);
assert.equal(requests.length, 0);
await crud.reservationRequest(storeId);
assert.equal(requests[0].url, "/api/admin/reservations?storeId=store-current");
assert.equal(requests[0].options.cache, "no-store");
for (const method of ["POST", "PATCH", "DELETE"]) {
  await crud.reservationRequest(storeId, method, { id: "record", storeId: "attacker" });
  const request = requests.at(-1);
  assert.equal(request.options.method, method);
  assert.equal(JSON.parse(request.options.body).storeId, storeId);
}
result = { ok: true, storeId: "other-store", rows: [] };
await assert.rejects(crud.reservationRequest(storeId), /매장/);
result = { ok: false, message: "denied" }; status = false;
await assert.rejects(crud.reservationRequest(storeId), /denied/);
assert.throws(() => crud.toIsoFromLocal(""), /예약시간/);
assert.throws(() => crud.toIsoFromLocal("not-a-date"), /예약시간/);
assert.equal(crud.toIsoFromLocal("2026-10-15T09:00:00+09:00"), "2026-10-15T00:00:00.000Z");

let current = { storeId: "songdo" };
const Page = load("src/app/admin/reservations/page.tsx", {
  "@/components/admin-crud-page": { AdminCrudPage: "ReservationEditor" },
  "@/lib/admin-context": { getAdminContext: async () => current },
  "@/lib/automation/device-map": { SONGDO_STORE_ID: "songdo" }
}).default;
const songdo = await Page();
assert.notEqual(songdo.type, "ReservationEditor");
assert.match(JSON.stringify(songdo), /VISTA 예약 미사용/);
current = { storeId: "siheung" };
const first = await Page();
assert.equal(first.type, "ReservationEditor");
assert.equal(first.props.reservationStoreId, "siheung");
assert.equal(first.key, "siheung");
assert.equal(first.props.initialRows.length, 0);
current = { storeId: "another" };
const second = await Page();
assert.notEqual(first.key, second.key, "Store changes must reset drafts, rows and in-flight component state");
const source = fs.readFileSync(new URL("../src/components/admin-crud-page.tsx", import.meta.url), "utf8");
assert.doesNotMatch(source, /\.from\("reservations"\)/);
assert.match(source, /setRows\(resource === "reservations" \? \[\] : initialRows\)/);
const shell = fs.readFileSync(new URL("../src/components/admin-shell.tsx", import.meta.url), "utf8");
assert.match(shell, /<StoreSwitcher\s+key=\{adminContext.storeId\}/, "Store change must reset the switcher's busy state");
console.log("Reservation client store scope checks passed (no production requests).");
