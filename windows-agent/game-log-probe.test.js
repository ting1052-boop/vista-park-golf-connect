/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createGameLogProbe, findSignals } = require("./game-log-probe");

test("findSignals finds only labelled hole and round candidates", () => {
  assert.deepEqual(findSignals("Hole: 3 Round Started"), {
    signals: ["hole_candidate", "round_start_candidate"],
    holeCandidates: [3]
  });
  assert.deepEqual(findSignals("score=72 distance=150"), { signals: [], holeCandidates: [] });
  assert.deepEqual(findSignals("라운드 완료 18번 홀"), {
    signals: ["hole_candidate", "round_end_candidate"],
    holeCandidates: [18]
  });
  assert.deepEqual(findSignals("GameManager::EnterNewHole: Loading New Hole - [Songdo_AB] 02hole"), {
    signals: ["hole_candidate"],
    holeCandidates: [2]
  });
  assert.deepEqual(findSignals("CGameContext::IsEndedHole: result State: 1"), {
    signals: ["round_end_candidate"],
    holeCandidates: []
  });
});

test("probe ignores old content and reports only later changes without raw text", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "vista-game-probe-"));
  const logPath = path.join(directory, "game.log");
  const events = [];
  try {
    await fs.writeFile(logPath, "Hole: 9 from an old round\n", "utf8");
    const probe = createGameLogProbe({ directories: [directory], onDiagnostic: (event) => events.push(event) });

    await probe.scan();
    assert.equal(events.length, 1);
    assert.equal(events[0].event, "baseline_ready");

    await fs.appendFile(logPath, "Hole: 3\nRound Completed\n", "utf8");
    await probe.scan();

    const change = events.find((event) => event.event === "file_changed");
    assert.ok(change);
    assert.deepEqual(change.holeCandidates, [3]);
    assert.deepEqual(change.signals, ["hole_candidate", "round_end_candidate"]);
    assert.equal("path" in change, false);
    assert.equal("rawText" in change, false);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
