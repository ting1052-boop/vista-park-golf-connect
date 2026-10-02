import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

async function check(action, body, isHeadAdmin = false) {
  const filters = [];
  let mutations = 0;
  const query = {
    select() { return this; },
    eq(key, value) { filters.push([key, value]); return this; },
    in() { return this; },
    order() { return this; },
    limit() { return this; },
    async maybeSingle() {
      assert.ok(filters.some(([key, value]) => key === "store_id" && value === "store-a"));
      return { data: null, error: null };
    }
  };
  const modules = {
    "next/server": { NextResponse: { json: (data, options = {}) => ({ data, status: options.status || 200 }) } },
    "@/lib/admin-context": { getAdminContext: async () => ({ storeId: "store-a", isHeadAdmin }) },
    "@/lib/supabase/server": { createSupabaseAdminClient: () => ({ from: () => query }) },
    "@/lib/session-cleanup": { closeSingleSession: async () => { mutations++; } },
    "@/lib/kiosk": { startWalkInSession: async () => { mutations++; } },
    "@/lib/reservation-policy": { isSupportedAdminDuration: () => true }
  };
  const source = fs.readFileSync(new URL(`../src/app/api/admin/session/${action}/route.ts`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: (name) => {
    assert.ok(name in modules, `Unexpected import: ${name}`);
    return modules[name];
  } });
  const response = await exports.POST({ json: async () => body });
  assert.equal(response.status, action === "start" ? 403 : 404);
  assert.equal(mutations, 0);
}

(async () => {
  await check("end", { accessSessionId: "foreign-session" });
  await check("end", { bayId: "foreign-bay" });
  await check("extend", { accessSessionId: "foreign-session", minutes: 10 });
  await check("extend", { bayId: "foreign-bay", minutes: 10 });
  await check("start", { storeId: "store-b", bayId: "foreign-bay", durationMinutes: 60 });
  await check("start", { storeId: "store-b", bayId: "foreign-bay", durationMinutes: 60 }, true);
  console.log("Session store scope: 6 checks passed (no device commands sent).");
})().catch((error) => { console.error(error); process.exitCode = 1; });
