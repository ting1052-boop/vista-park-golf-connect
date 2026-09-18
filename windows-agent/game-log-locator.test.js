/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createGameLogLocator, expandPattern } = require("./game-log-locator");
const { createScreenGolfMonitor } = require("./screen-golf-monitor");

async function makeInstall(root, folder, contents) {
  const dir = path.join(root, folder, "ScreenGolf", "Saved", "Logs");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, "ScreenGolf.log");
  await fs.writeFile(file, contents, "utf8");
  return file;
}

test("pattern expansion finds every dated install folder", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vista-locator-"));
  try {
    await makeInstall(root, "PARK_260529-VISTA", "");
    await makeInstall(root, "PARK_260713-VISTA", "");
    await fs.mkdir(path.join(root, "UNRELATED"), { recursive: true });

    const found = await expandPattern(path.join(root, "PARK_*-VISTA", "ScreenGolf", "Saved", "Logs", "ScreenGolf.log"));
    assert.equal(found.length, 2);
    assert.ok(found.every((p) => p.includes("PARK_")));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("locator picks the install that was written most recently", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vista-locator-pick-"));
  try {
    const older = await makeInstall(root, "PARK_260713-VISTA", "old\n");
    const newer = await makeInstall(root, "PARK_260529-VISTA", "new\n");
    // 2026-09-18 현장과 같은 상황: 설정이 가리키던 폴더가 아니라 실제로 쓰이는 폴더를 따라가야 한다.
    await fs.utimes(older, new Date(Date.now() - 3_600_000), new Date(Date.now() - 3_600_000));

    const locator = createGameLogLocator({
      logFile: older,
      patterns: [path.join(root, "PARK_*-VISTA", "ScreenGolf", "Saved", "Logs", "ScreenGolf.log")]
    });

    assert.equal(await locator.resolve(), newer);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("monitor follows the game when it moves to another install", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vista-locator-follow-"));
  try {
    const configured = await makeInstall(root, "PARK_260713-VISTA", "stale\n");
    const active = await makeInstall(root, "PARK_260529-VISTA", "");
    await fs.utimes(configured, new Date(Date.now() - 3_600_000), new Date(Date.now() - 3_600_000));

    const monitor = createScreenGolfMonitor({
      logFile: configured,
      locator: createGameLogLocator({
        logFile: configured,
        patterns: [path.join(root, "PARK_*-VISTA", "ScreenGolf", "Saved", "Logs", "ScreenGolf.log")]
      })
    });

    await monitor.observe(true);
    // 설정에 적힌 폴더가 아니라, 실제로 게임이 쓰는 폴더의 새 줄을 읽어야 한다.
    await fs.appendFile(active, "LogNet: Browse: /Game/Golf/Course/Yecheon_AB/Yecheon_AB?Name=Player\n", "utf8");
    const state = await monitor.observe(true);

    assert.ok(state, "활성 설치본의 로그를 읽어 상태가 생겨야 한다");
    assert.equal(state.gameState, "playing");
    assert.equal(state.courseId, "Yecheon_AB");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
