import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const file = fs.readFileSync(new URL("../src/app/admin/remote-access/remote-access-client.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("list.tsx", file, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functionNode = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "getVisibleDevices");
assert(functionNode);
const context = { exports: {}, Date, deviceCollator: new Intl.Collator("ko", { numeric: true, sensitivity: "base" }) };
vm.runInNewContext(ts.transpileModule(functionNode.getText(ast) + "\nexports.list = getVisibleDevices;", {
  compilerOptions: { module: ts.ModuleKind.CommonJS }
}).outputText, context);
const list = context.exports.list;
const devices = [
  { deviceId: "park", storeId: "songdo", storeName: "송도", bayCode: "P-02", computerName: "PARK02", registeredAt: "2026-10-10T00:00:00Z" },
  { deviceId: "a10", storeId: "songdo", storeName: "송도", bayCode: "A-10", computerName: "RANGE10", registeredAt: "2026-10-09T00:00:00Z" },
  { deviceId: "other", storeId: "other-store", storeName: "송도", bayCode: "A-01", computerName: "RANGE01", registeredAt: "2026-10-11T00:00:00Z" },
  { deviceId: "a2", storeId: "songdo", storeName: "송도", bayCode: "A-02", computerName: "RANGE2", registeredAt: "2026-10-08T00:00:00Z" },
  { deviceId: "a1", storeId: "songdo", storeName: "송도", bayCode: "A-01", computerName: "RANGE1", registeredAt: "invalid" }
];
const before = JSON.stringify(devices);
devices.forEach(Object.freeze);
Object.freeze(devices);
const ids = (rows) => Array.from(rows, (row) => row.deviceId);
assert.deepEqual(ids(list(devices, "songdo", "bay")), ["a1", "a2", "a10", "park"]);
assert.deepEqual(ids(list(devices, "songdo", "recent")), ["park", "a10", "a2", "a1"]);
assert.deepEqual(ids(list(devices, "songdo", "pc")), ["park", "a1", "a2", "a10"]);
assert.equal(list(devices, "", "bay").length, 5);
assert.equal(list(devices, "missing-store", "bay").length, 0);
assert.deepEqual(ids(list(devices, "other-store", "bay")), ["other"]);
assert.equal(JSON.stringify(devices), before);
const tied = devices.map((device) => ({ ...device, registeredAt: "2026-10-10T00:00:00Z" }));
assert.deepEqual(ids(list(tied, "songdo", "recent")), ["a1", "a2", "a10", "park"]);
const api = fs.readFileSync(new URL("../src/app/api/admin/remote-access/route.ts", import.meta.url), "utf8");
assert(api.includes("storeId: row.store_id"));
assert(file.includes("visibleDevices.map"));
assert(file.includes("listStoreId ? \"선택한 매장에 등록된 PC가 없습니다.\""));
assert(file.includes("const [listStoreId, setListStoreId] = useState(\"\")"));
assert(file.includes("storeId: draft.storeId"));
console.log("Remote access list checks passed: store-ID filtering, numeric bay/PC ordering, recent registration, empty results, immutable data and independent registration form.");
