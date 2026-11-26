import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

// 리포트 날짜 범위 검사: 잘못된 범위가 RPC 의 "0행"으로 새어 "게임 없음"처럼 보이면 안 된다.
const source = fs.readFileSync(new URL("../src/app/api/admin/round-counts/range.ts", import.meta.url), "utf8");
const mod = { exports: {} };
new Function("module", "exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(mod, mod.exports);
const { parseRoundCountRange } = mod.exports;
const parse = (query) => parseRoundCountRange(new URLSearchParams(query), "2026-11-13", "2026-11-26");

assert.deepEqual(parse(""), { from: "2026-11-13", to: "2026-11-26" });
assert.deepEqual(parse("from=2026-11-01&to=2026-11-01"), { from: "2026-11-01", to: "2026-11-01" });
assert.deepEqual(parse("from=2026-08-26&to=2026-11-26"), { from: "2026-08-26", to: "2026-11-26" }); // 92일 차 = 93일
assert.ok("error" in parse("from=2026-08-25&to=2026-11-26"));
assert.ok("error" in parse("from=2026-11-26&to=2026-11-25"));
assert.ok("error" in parse("from=2026-02-30"));
assert.ok("error" in parse("from=20261101"));
assert.ok("error" in parse("to=2026-11-26T00:00"));
console.log("Round count range checks passed.");
