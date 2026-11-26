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
// 송도는 항상 관찰 전용(라운드 집계 관찰 매장 조건이 뒤에 OR 로 붙을 수 있다).
assert(file.includes("observationOnly={currentStoreId === SONGDO_STORE_ID"));
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
  assert(!html.includes("오늘 이용"), "card no longer shows usage counts");
  assert(html.includes("PC 연결됨"));
  assert.equal(html.split("대기 중").length - 1, 1);
}
assert(render(true, "available", "unknown").includes("상태 확인 불가"));
assert(render(true, "in_use", "active").includes(">이용 중<"));
assert(render(true, "available", "unknown", false).includes("신호 없음"));
for (const usage of ["unknown", "active", "awaiting_input"]) {
  const offline = render(true, "available", usage, false);
  assert(offline.includes("PC 미연결"));
  assert(!offline.includes("상태 확인 불가"));
  assert(!offline.includes("border-amber-200"));
  assert(!offline.includes(">이용 중<"));
}
assert(render(false, "available", "unknown", false).includes("상태 확인 불가"));
assert(render(true, "maintenance").includes("점검 완료 처리"));
assert(render(false).includes("관리자 입장 시작"));
assert(render(false).includes("즉시 사용 가능"));
assert(render(false, "waiting").includes("입장 처리 및 세션 시작"));
assert(render(false, "in_use").includes("이용 종료"));
assert(render(false, "in_use").includes("시간 조정"));

// 파크 타석: 게임 상태 한 줄만. 집계·홀 번호는 카드에 없다(리포트로 이동).
const park = (gameTelemetry, openRound, extra = {}, observationOnly = false) => renderToStaticMarkup(
  require("react").createElement(context.exports.Card, {
    observationOnly, storeMonitorOnly: false, limitedMenu: false, openRound,
    bay: {
      name: "A-02", zone: "A구역", status: "available", mode: "즉시 배정 가능", pcOnline: true, gameTelemetry,
      gameActivity: { supported: true, todayUsageStarts: 3, recentEvents: [{ eventId: "e", occurredAt: new Date().toISOString(), lastKnownHole: 7 }] },
      roundSummary: { todayStarted: 2, yesterdayCounted: 1, yesterdayPartial: 0, todayPracticeCount: 0, todayPracticeMinutes: 0, pendingCount: 1 },
      ...extra
    },
    onEndSession() {}, onExtendTime() {}, onCheckIn() {}, onMaintenanceDone() {}
  })
);
const now = new Date().toISOString();
const playing = { gameRunning: true, observedAt: now, gameState: "playing", gameMode: "regular", courseId: "Yecheon_CD", currentHole: 7, holeStatus: "confirmed", holeObservedAt: now, schemaVersion: 2, stateSource: "log" };
const started = new Date(Date.now() - 23 * 60_000 - 5_000).toISOString();
assert(park(playing, { courseId: "Yecheon_CD", startedAt: started }).includes("게임 중 · Yecheon_CD · 23분째"));
assert(park(playing).includes(">게임 중 · Yecheon_CD<"));
assert(!park(playing, { courseId: "Songdo_AB", startedAt: started }).includes("분째"), "open round of another course must not give minutes");
assert(park({ ...playing, courseId: null }).includes(">게임 중<"));
assert(park({ gameRunning: true, observedAt: now, gameState: "menu", gameMode: "lobby" }).includes("대기(로비)"));
assert(park({ gameRunning: false, observedAt: now, gameState: "not_running" }).includes("프로그램 꺼짐"));
assert(park(undefined).includes("상태 확인 불가"));
assert(park(playing, undefined, { gameTelemetryStale: true }).includes("상태 확인 불가"));
for (const html of [park(playing, { courseId: "Yecheon_CD", startedAt: started }), park(undefined)]) {
  for (const text of ["오늘 시작", "어제 확정", "중도 종료", "오늘 연습", "확인 대기", "오늘 이용", "번 홀", "일별 게임 수"]) {
    assert(!html.includes(text), `card must not show ${text}`);
  }
}
// 게임 로그를 못 찾은 Agent(프로그램은 켜짐, 화면 상태 unknown)는 "상태 확인 불가"로 보인다.
assert(park({ gameRunning: true, observedAt: now, gameState: "unknown", stateSource: "process", reasonCode: "capture_source_not_found" }).includes("상태 확인 불가"));
// 관찰 매장에서도 60분 이용 신호(usage)가 없는 파크 신호는 같은 네 가지 문구를 쓴다.
assert(park({ gameRunning: false, observedAt: now, gameState: "not_running" }, undefined, {}, true).includes("프로그램 꺼짐"));
assert(park(playing, undefined, {}, true).includes(">게임 중 · Yecheon_CD<"));
assert(park({ gameRunning: true, observedAt: now, gameState: "menu", gameMode: "lobby" }, undefined, {}, true).includes("대기(로비)"));
assert(!file.includes("RoundHistory"), "daily game table moved to /admin/reports");

console.log("Songdo card checks passed: observation states only, unknown preserved, commercial admission/session controls preserved.");
