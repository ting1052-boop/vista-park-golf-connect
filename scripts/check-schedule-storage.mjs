import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(file, imports = {}) {
  const exports = {};
  const compiled = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS }
  }).outputText;
  vm.runInNewContext(compiled, { exports, require: (name) => imports[name], Intl });
  return exports;
}

const { getStoreAutomationSchedule } = load("../src/lib/store-automation-schedule.ts", {
  "@/lib/store-controller": {},
  "@/lib/automation/device-map": {
    SONGDO_STORE_ID: "songdo",
    getStoreAutomationGroup: (code) => code === "A-01" ? "golf" : code === "P-01" ? "park" : null
  }
});
const { validateScheduleConfig } = load("../src/lib/automation/schedule-config.ts");
function db(row, columnExists = false) {
  return {
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle: async () => ({ data: row, error: null }),
        limit: async () => ({ error: columnExists ? null : { message: "column automation_schedule_config does not exist" } }),
        then(resolve) {
          assert.equal(table, "bays");
          return Promise.resolve({ data: [
            { id: "g1", bay_code: "A-01" }, { id: "g7", bay_code: "A-07" }, { id: "p1", bay_code: "P-01" }
          ], error: null }).then(resolve);
        }
      };
    }
  };
}
const old = await getStoreAutomationSchedule(db({ golf_open_time: "05:50", golf_close_time: "23:20" }), "songdo");
assert.equal(old.storageAvailable, false);
assert.equal(old.config.schedules[0].openTime, "05:50");
assert.deepEqual(Array.from(old.config.schedules[0].bayIds), ["g1"]);
assert.deepEqual(Array.from(old.config.schedules[0].closeBayIds), ["g1", "g7"]);
assert.equal((await getStoreAutomationSchedule(db({ automation_schedule_config: null }), "other")).storageAvailable, true);
assert.equal((await getStoreAutomationSchedule(db(null), "other")).storageAvailable, false);
assert.equal((await getStoreAutomationSchedule(db(null, true), "other")).storageAvailable, true);
const golf = { ...old.config.schedules[0], bayIds: ["g1", "g7"] };
const park = { ...old.config.schedules[1], openTime: "09:50", closeTime: "21:30" };
const config = validateScheduleConfig({ mode: "zones", schedules: [golf, park] }, new Set(["g1", "g7", "p1"]));
assert.deepEqual(Array.from(config.schedules[0].bayIds), ["g1", "g7"]);
assert.throws(() => validateScheduleConfig({ mode: "zones", schedules: [{ ...golf, bayIds: ["foreign"] }, park] }, new Set(["g1", "g7", "p1"])), /다른 매장/);
console.log("Schedule storage checks passed: missing/applied schema, empty stores, legacy targets, A-07 selection, store scope.");
