/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { mergeBaysConfig } = require("./agent-config");
const { createScreenGolfMonitor, parseScreenGolfEvents } = require("./screen-golf-monitor");

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

test("parser recognizes only verified ScreenGolf state transitions", () => {
  assert.deepEqual(parseScreenGolfEvents("Game class is 'SGGameModeBase_C'\n"), ["round_entered"]);
  assert.deepEqual(parseScreenGolfEvents("Game class is 'BP_LobbyModebase_C'\n"), ["lobby_entered"]);
  assert.deepEqual(parseScreenGolfEvents("score=72 hole=3\n"), []);
});

test("monitor reports playing and conservatively classifies a lobby return", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "vista-screen-golf-"));
  const logFile = path.join(directory, "ScreenGolf.log");
  try {
    await fs.writeFile(logFile, "Game class is 'SGGameModeBase_C'\n", "utf8");
    const monitor = createScreenGolfMonitor({ logFile });
    assert.deepEqual(await monitor.observe(true), {
      gameState: "playing",
      currentHole: null,
      roundStatus: "in_progress",
      stateSource: "mixed",
      confidence: "high",
      reasonCode: null
    });

    await fs.appendFile(logFile, "Game class is 'BP_LobbyModebase_C'\n", "utf8");
    assert.deepEqual(await monitor.observe(true), {
      gameState: "menu",
      currentHole: null,
      roundStatus: "unknown",
      stateSource: "mixed",
      confidence: "high",
      reasonCode: "round_exit_unclassified"
    });

    assert.equal((await monitor.observe(false)).gameState, "not_running");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
