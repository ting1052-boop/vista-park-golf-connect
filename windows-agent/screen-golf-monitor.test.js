/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { mergeBaysConfig } = require("./agent-config");
const { createScreenGolfMonitor, parseScreenGolfEvents } = require("./screen-golf-monitor");

async function withLog(initial, run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "vista-screen-golf-"));
  const logFile = path.join(directory, "ScreenGolf.log");
  try {
    await fs.writeFile(logFile, initial, "utf8");
    const monitor = createScreenGolfMonitor({ logFile });
    // 첫 조회는 파일 끝을 기준점으로 잡는다(이전 실행 기록 무시).
    await monitor.observe(true);
    await run(monitor, async (text) => {
      await fs.appendFile(logFile, text, "utf8");
    });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test("base monitoring defaults survive a partial secret config", () => {
  const merged = mergeBaysConfig(
    {
      shared: { gameMonitoringEnabled: true, gameProcessNames: ["ScreenGolf.exe"] },
      bays: [{ bayCode: "A-02", label: "base" }]
    },
    { shared: { apiBaseUrl: "https://example.test" }, bays: [{ bayCode: "A-02", agentToken: "secret" }] }
  );

  assert.equal(merged.shared.gameMonitoringEnabled, true);
  assert.deepEqual(merged.shared.gameProcessNames, ["ScreenGolf.exe"]);
  assert.equal(merged.bays[0].label, "base");
  assert.equal(merged.bays[0].agentToken, "secret");
});

test("parser separates real courses, practice maps and the shared game mode line", () => {
  assert.deepEqual(parseScreenGolfEvents("Browse: /Game/Golf/Course/Yecheon_CD/Yecheon_CD?Name=P\n"), [
    "round_entered"
  ]);
  assert.deepEqual(parseScreenGolfEvents("Browse: /Game/Golf/Course/Practice_park1/Practice_park1?Name=P\n"), [
    "practice_entered"
  ]);
  // 연습장과 정규 라운드가 함께 쓰는 줄이라 단독으로 라운드를 만들면 안 된다.
  assert.deepEqual(parseScreenGolfEvents("Game class is 'SGGameModeBase_C'\n"), ["game_mode_entered"]);
  assert.deepEqual(parseScreenGolfEvents("Game class is 'BP_LobbyModebase_C'\n"), ["lobby_entered"]);
  assert.deepEqual(parseScreenGolfEvents("score=72 hole=3\n"), []);
});

test("a round that returns to the lobby is completed and survives the duplicate lobby line", async () => {
  await withLog("old run noise\n", async (monitor, append) => {
    await append("Browse: /Game/Golf/Course/Yecheon_CD/Yecheon_CD?Name=P\n");
    await append("Game class is 'SGGameModeBase_C'\n");
    let state = await monitor.observe(true);
    assert.equal(state.gameState, "playing");
    assert.equal(state.roundStatus, "in_progress");

    // 실제 로그에서는 로비 복귀 때 두 줄이 연달아 나온다.
    await append("Browse: /Game/Golf/UI/UIMap\nGame class is 'BP_LobbyModebase_C'\n");
    state = await monitor.observe(true);
    assert.equal(state.roundStatus, "completed", "두 번째 로비 줄이 종료 상태를 덮으면 안 된다");
    assert.equal(state.reasonCode, "returned_to_lobby");

    // 다음 조회에서도 유지된다.
    await append("Game class is 'BP_LobbyModebase_C'\n");
    state = await monitor.observe(true);
    assert.equal(state.roundStatus, "completed");

    // 새 라운드가 시작될 때만 초기화된다.
    await append("Browse: /Game/Golf/Course/Yecheon_CD/Yecheon_CD?Name=P\n");
    state = await monitor.observe(true);
    assert.equal(state.roundStatus, "in_progress");
  });
});

test("practice maps never become a round", async () => {
  await withLog("", async (monitor, append) => {
    await append("Browse: /Game/Golf/Course/Practice_park1/Practice_park1?Name=P\n");
    await append("Game class is 'SGGameModeBase_C'\n");
    let state = await monitor.observe(true);
    assert.equal(state.gameState, "practice");
    assert.equal(state.roundStatus, "not_started");

    await append("Game class is 'BP_LobbyModebase_C'\n");
    state = await monitor.observe(true);
    assert.equal(state.roundStatus, "not_started", "연습장 복귀는 라운드 종료가 아니다");
  });
});

test("exit during a round is recorded as aborted", async () => {
  await withLog("", async (monitor, append) => {
    await append("Browse: /Game/Golf/Course/Yecheon_CD/Yecheon_CD?Name=P\n");
    await monitor.observe(true);

    await append("FPlatformMisc::RequestExit(0)\n");
    const state = await monitor.observe(true);
    assert.equal(state.gameState, "exiting");
    assert.equal(state.roundStatus, "aborted");

    assert.equal((await monitor.observe(false)).gameState, "not_running");
  });
});

test("a fresh start ignores events already in the log", async () => {
  await withLog("Browse: /Game/Golf/Course/Yecheon_CD/Yecheon_CD?Name=P\n", async (monitor) => {
    // 첫 조회 이후 새 줄이 없으므로 과거 라운드가 현재 상태가 되면 안 된다.
    assert.equal(await monitor.observe(true), null);
  });
});
