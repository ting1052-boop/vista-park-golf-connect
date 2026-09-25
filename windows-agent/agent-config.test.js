const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { mergeBaysConfig, resolveBayPolicy } = require("./agent-config");

const baseConfig = JSON.parse(fs.readFileSync(path.join(__dirname, "bays.config.json"), "utf8"));

// 실제 설정으로 확인한다. 설정 파일이 바뀌어 아파트 타석이 손님 화면을 켜거나
// 서버 세션을 종료하게 되면 여기서 걸려야 한다.
function bayPolicy(bayCode, localConfig = {}) {
  const merged = mergeBaysConfig(baseConfig, localConfig);
  const bay = merged.bays.find((entry) => entry.bayCode === bayCode);
  assert.ok(bay, `${bayCode} 타석이 설정에 없다`);
  return resolveBayPolicy({ ...merged.shared, ...bay });
}

test("monitorOnly bay never changes server state", () => {
  const policy = bayPolicy("SD-R-01");

  assert.equal(policy.monitorOnly, true);
  // 남은시간 경고창·종료 잠금화면을 띄우지 않는다
  assert.equal(policy.showsCustomerUi, false);
  // 만료 세션을 Agent 가 종료하지 않는다. 종료하면 서버가 장비 OFF 명령까지 건다
  assert.equal(policy.mayEndServerSession, false);
  // 스스로 PC 를 끄지 않는다
  assert.equal(policy.autoShutdownAfterEndMinutes, 0);
});

test("monitorOnly wins even when the config asks for auto shutdown", () => {
  // 설정에 값이 남아 있어도 무시해야 한다. 손님이 치는 중에 PC 가 꺼지면 안 된다.
  const policy = resolveBayPolicy({ monitorOnly: true, autoShutdownAfterEndMinutes: 5 });

  assert.equal(policy.autoShutdownAfterEndMinutes, 0);
  assert.equal(policy.mayEndServerSession, false);
});

test("every Songdo bay in the shipped config is monitor-only", () => {
  const songdo = mergeBaysConfig(baseConfig).bays.filter((bay) => bay.bayCode.startsWith("SD-"));

  assert.equal(songdo.length, 9, "송도 타석은 9개여야 한다");
  for (const bay of songdo) {
    const policy = bayPolicy(bay.bayCode);
    assert.equal(policy.monitorOnly, true, `${bay.bayCode} 가 monitorOnly 가 아니다`);
    assert.equal(policy.mayEndServerSession, false, `${bay.bayCode} 가 서버 세션을 종료할 수 있다`);
    assert.equal(policy.autoShutdownAfterEndMinutes, 0, `${bay.bayCode} 가 스스로 PC 를 끈다`);
    assert.equal(bay.gameMonitoringEnabled, false, `${bay.bayCode} 가 확인되지 않은 시흥 게임을 감지한다`);
    assert.equal(bay.gameLogDiagnosticsEnabled, false, `${bay.bayCode} 가 시흥 로그 경로를 조사한다`);
  }
});

test("Siheung bays keep the customer overlay and auto shutdown", () => {
  for (const bayCode of ["A-01", "A-02", "A-03"]) {
    const policy = bayPolicy(bayCode);
    assert.equal(policy.monitorOnly, false, `${bayCode} 가 monitorOnly 로 바뀌었다`);
    assert.equal(policy.showsCustomerUi, true);
    assert.equal(policy.mayEndServerSession, true);
    assert.equal(policy.autoShutdownAfterEndMinutes, 5);
  }
});

test("the installer's local config shape applies one token and nothing else", () => {
  // songdo/Agent설치.ps1 이 %APPDATA%\vista-windows-agent 에 쓰는 것과 같은 모양
  const local = { bays: [{ bayCode: "SD-P-01", agentToken: "songdoParkOneTokenExample1234567890" }] };
  const merged = mergeBaysConfig(baseConfig, local);
  const usable = (bay) => {
    const token = String({ ...merged.shared, ...bay }.agentToken ?? "");
    return token.length > 0 && !/^(?:change-me|replace_with_)/iu.test(token);
  };

  const installed = merged.bays.filter(usable).map((bay) => bay.bayCode);
  assert.deepEqual(installed, ["SD-P-01"], "설치한 타석 하나만 서버에 붙을 수 있어야 한다");

  // 타석 수가 늘거나 코드가 겹치면 설치 화면의 번호가 어긋난다
  const codes = merged.bays.map((bay) => bay.bayCode);
  assert.equal(new Set(codes).size, codes.length, "bayCode 가 중복된다");
});
