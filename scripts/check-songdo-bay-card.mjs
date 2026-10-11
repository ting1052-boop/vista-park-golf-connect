import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const file = fs.readFileSync(new URL("../src/app/admin/dashboard/dashboard-client.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("card.tsx", file, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ["BayCard", "getGameStatusDisplay", "getBayUsageText"];
const source = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text))
  .map((node) => node.getText(ast)).join("\n");
assert(source.includes("function BayCard"));
assert(file.includes("observationOnly={currentStoreId === SONGDO_STORE_ID}"));
const icon = () => null;
const meta = { label: "사용 가능", icon, card: "", badge: "", dot: "", iconBox: "" };
const context = {
  require, exports: {}, Date,
  cn: (...values) => values.filter(Boolean).join(" "),
  statusMeta: Object.fromEntries(["available", "in_use", "waiting", "maintenance"].map((status) => [status, meta])),
  usageStateLabels: { idle: "대기 중", in_use: "이용 중", unknown: "확인 불가" },
  pcConnectionLabels: { connected: "PC 연결됨", no_signal: "신호 없음" },
  Activity: icon, Power: icon, PlusCircle: icon, UserCheck: icon, Wrench: icon,
  CircularTimer: icon, InfoBlock: icon
};
vm.runInNewContext(ts.transpileModule(source + "\nexports.Card = BayCard;", {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
}).outputText, context);
const render = (observationOnly, status = "available", usage = "awaiting_input", pcOnline = true) => renderToStaticMarkup(
  require("react").createElement(context.exports.Card, {
    observationOnly, storeMonitorOnly: false, limitedMenu: false,
    bay: {
      name: "A-05", zone: "A구역", status, mode: "즉시 배정 가능", pcOnline,
      usageState: "idle", totalMinutes: 60, remainingMinutes: 45,
      gameTelemetry: { gameRunning: true, observedAt: new Date().toISOString(), usage: {
        state: usage, endsAt: new Date(Date.now() + 60000).toISOString()
      } },
      gameActivity: { supported: true, todayUsageStarts: 0, recentEvents: [] }
    },
    onEndSession() {}, onExtendTime() {}, onCheckIn() {}, onMaintenanceDone() {}
  })
);
for (const status of ["available", "waiting", "in_use"]) {
  const html = render(true, status);
  for (const text of ["사용 가능", "즉시 배정 가능", "현재 상태", "관리자 입장 시작", "입장 처리 및 세션 시작", "이용 종료", "시간 조정", "이용 고객"]) {
    assert(!html.includes(text), `Songdo must not show ${text} (${status})`);
  }
  assert(html.includes("오늘 이용 감지 0회"));
  assert(html.includes("PC 연결됨"));
  assert.equal(html.split("대기 중").length - 1, 1);
}
assert(render(true, "available", "unknown").includes("상태 확인 불가"));
assert(render(true, "in_use", "active").includes(">이용 중<"));
assert(render(true, "available", "unknown", false).includes("신호 없음"));
assert(render(true, "maintenance").includes("점검 완료 처리"));
assert(render(false).includes("관리자 입장 시작"));
assert(render(false).includes("즉시 사용 가능"));
assert(render(false, "waiting").includes("입장 처리 및 세션 시작"));
assert(render(false, "in_use").includes("이용 종료"));
assert(render(false, "in_use").includes("시간 조정"));
console.log("Songdo card checks passed: observation states only, unknown preserved, commercial admission/session controls preserved.");
