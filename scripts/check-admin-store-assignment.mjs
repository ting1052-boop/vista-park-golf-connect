import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/lib/admin-context.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;

function context({ role = "store_manager", assignment = { store_id: "songdo", role }, assignmentError = null, storeError = null, missingStore = false, cookie = "siheung" } = {}) {
  const reads = [];
  const db = { from(table) {
    let storeId;
    let fields;
    return {
      select(value) { fields = value; return this; },
      eq(key, value) { if (key === "id") storeId = value; return this; },
      order() { return this; },
      limit() { return this; },
      async maybeSingle() {
        reads.push({ table, storeId, fields });
        if (table === "users") return { data: { role }, error: null };
        if (table === "store_users") return { data: assignment, error: assignmentError };
        if (table === "stores") return {
          data: missingStore || storeError ? null : { id: storeId, name: storeId, agent_monitor_only: true },
          error: storeError
        };
        throw new Error(`Unexpected table: ${table}`);
      }
    };
  } };
  const modules = {
    "next/headers": { cookies: async () => ({ get: () => ({ value: cookie }) }) },
    "@/lib/admin-auth": { requireAdminUser: async () => ({ id: "user", app_metadata: {}, user_metadata: {} }) },
    "@/lib/supabase/server": { createSupabaseAdminClient: () => db }
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: (name) => modules[name] });
  return { exports, reads };
}

for (const role of ["store_manager", "staff"]) {
  const valid = context({ role });
  assert.equal((await valid.exports.getAdminContext()).storeId, "songdo");
  assert.ok(!valid.reads.some((read) => read.table === "stores" && read.storeId === "siheung"));
  for (const failure of [{ assignment: null }, { assignment: { store_id: "", role } }, { assignmentError: { message: "offline" } }]) {
    const blocked = context({ role, ...failure });
    await assert.rejects(blocked.exports.getAdminContext(), /매장/);
    assert.equal(await blocked.exports.getOptionalAdminContext(), null);
    assert.ok(!blocked.reads.some((read) => read.table === "stores"));
  }
}
await assert.rejects(context({ missingStore: true }).exports.getAdminContext(), /매장/);
await assert.rejects(context({ storeError: { message: "offline" } }).exports.getAdminContext(), /매장/);
assert.equal((await context({ role: "head_admin" }).exports.getAdminContext()).storeId, "siheung");
assert.equal((await context({ role: "head_admin", cookie: "" }).exports.getAdminContext()).storeId, "11111111-1111-4111-8111-111111111111");
console.log("Admin store assignment: missing/error assignments denied, assigned store isolated, head selection preserved.");
