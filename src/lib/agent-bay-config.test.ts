import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { buildAgentInstallFiles } from "./agent-bay-config";

// 서버가 만든 파일을 Agent 의 실제 병합·정책 코드에 그대로 넣어 본다.
// 서버와 Agent 사이의 약속이 깨지면(키 이름, 병합 방식) 여기서 걸린다.
const require = createRequire(import.meta.url);
const { mergeBaysConfig, resolveBayPolicy } = require("../../windows-agent/agent-config.js");
const shippedBase = require("../../windows-agent/bays.config.json");

function installOnAgent(files: ReturnType<typeof buildAgentInstallFiles>) {
  // Agent 0.9.6 의 loadBaysConfig: 내장 설정 → (사용자 설정 없음) → PC 공용 설정
  const merged = mergeBaysConfig(mergeBaysConfig(shippedBase), files["bays.config.local.json"]);
  const bay = merged.bays.find((entry: { bayCode: string }) => entry.bayCode === files["agent.config.json"].bayCode);
  assert.ok(bay, "선택한 타석이 병합 결과에 없다");
  const effective = { ...merged.shared, ...bay };
  const token = String(effective.agentToken ?? "");
  return {
    effective,
    policy: resolveBayPolicy(effective),
    tokenUsable: token.length > 0 && !/^(?:change-me|replace_with_)/iu.test(token)
  };
}

test("apartment store installs as monitor-only with the issued token", () => {
  const files = buildAgentInstallFiles({
    storeCode: "VISTA-XII",
    storeName: "송도파크자이",
    bayCode: "A-01",
    bayDisplayName: "골프 1번",
    monitorOnly: true,
    agentToken: "issuedTokenExample0123456789abcdefghij"
  });
  const { effective, policy, tokenUsable } = installOnAgent(files);

  assert.equal(tokenUsable, true);
  assert.equal(policy.monitorOnly, true);
  assert.equal(policy.showsCustomerUi, false);
  assert.equal(policy.mayEndServerSession, false);
  assert.equal(policy.autoShutdownAfterEndMinutes, 0);
  assert.equal(effective.usageMonitoringEnabled, true);
  assert.equal(effective.usageMonitoringProfile, "golf_input");
  assert.equal(effective.sessionSource, "server");
});

test("a store bay code that also exists in the shipped config does not inherit its values", () => {
  // 송도 A-01 과 시흥 A-01 은 코드가 같다. 내장 시흥 A-01 의 pcName(VISTA-BAY-01)이
  // 섞이면 Agent 가 실제 호스트명 대신 그 이름을 보고한다.
  for (const storeCode of ["VISTA-XII", "VISTA-SH"]) {
    const files = buildAgentInstallFiles({
      storeCode,
      storeName: "매장",
      bayCode: "A-01",
      bayDisplayName: null,
      monitorOnly: storeCode === "VISTA-XII",
      agentToken: "issuedTokenExample0123456789abcdefghij"
    });
    const { effective } = installOnAgent(files);
    assert.equal(effective.pcName, undefined, `${storeCode} 가 내장 시흥 A-01 의 pcName 을 물려받았다`);
    assert.equal(effective.agentId, `${storeCode.toLowerCase()}-a-01`);
  }
});

test("regular store keeps the customer overlay and shared game monitoring", () => {
  const files = buildAgentInstallFiles({
    storeCode: "VISTA-SH",
    storeName: "비스타파크골프 시흥점",
    bayCode: "A-02",
    bayDisplayName: "2번 타석",
    monitorOnly: false,
    agentToken: "issuedTokenExample0123456789abcdefghij"
  });
  const { effective, policy, tokenUsable } = installOnAgent(files);

  assert.equal(tokenUsable, true);
  assert.equal(policy.monitorOnly, false);
  assert.equal(policy.showsCustomerUi, true);
  assert.equal(policy.autoShutdownAfterEndMinutes, 5);
  assert.equal(effective.gameMonitoringEnabled, true);
  assert.equal(effective.label, "비스타파크골프 시흥점 · 2번 타석");
});

test("label falls back to the bay code when there is no display name", () => {
  const files = buildAgentInstallFiles({
    storeCode: "VISTA-XII",
    storeName: "송도파크자이",
    bayCode: "P-02",
    bayDisplayName: "   ",
    monitorOnly: true,
    agentToken: "t".repeat(40)
  });
  assert.equal(files["bays.config.local.json"].bays[0].label, "송도파크자이 · P-02");
  assert.equal(files["agent.config.json"].bayCode, "VISTA-XII:P-02");
  assert.equal(files["bays.config.local.json"].bays[0].gameMonitoringEnabled, true);
  assert.equal(files["bays.config.local.json"].bays[0].gameProcessNames?.[0], "ScreenGolf.exe");
  assert.equal(files["bays.config.local.json"].bays[0].usageMonitoringProfile, "park_log");
});
