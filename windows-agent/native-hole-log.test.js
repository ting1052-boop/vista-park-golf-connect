/* eslint-disable @typescript-eslint/no-require-imports */
// 합성 fixture: 원문 로그는 없다. 줄 모양은 fixtures/round-evidence/siheung-a02-20261125.jsonl 의 shapes,
// 시각·홀 순서는 같은 파일의 events(2026-11-25 시흥 A-02 18홀·9홀 두 판)를 그대로 옮겼다.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { assignRunsToRounds, parseMainLogRuns, reconcileHoleLogs } = require("./native-hole-log");
const { createRoundLedger } = require("./round-ledger");
const { createRoundReportOutbox } = require("./round-report-outbox");

const KST = 540;
const SRC = "[D:\\Dev\\Golf\\SG2024x\\Source\\Game\\Core\\Play\\GameManager.cpp 1520]";
const CTX = "[D:\\Dev\\Golf\\SG2024x\\Source\\Game\\Core\\Play\\GameContext.cpp 210]";
const pad = (n) => String(n).padStart(2, "0");

// holes: [[진입 시각, 홀아웃 시각 또는 null], ...] 1번 홀부터
function game(course, holes) {
  const lines = [];
  holes.forEach(([enteredAt, holedOutAt], index) => {
    const hole = index + 1;
    if (hole === 1) {
      lines.push(`${enteredAt}:120 ?<Log> ${SRC} GameManager::EnterNewHole: Open New Level - [${course}], Stage:0,  Tee:1`);
      lines.push(`${enteredAt}:121 ?<Log> ${SRC} GameManager::EnterNewHole: player<0>[??????1], tee:1`);
    } else {
      lines.push(`${enteredAt}:300 ?<Log> ${SRC} GameManager::EnterNewHole: Enter New Hole - [${course}] ${pad(hole)}hole`);
    }
    lines.push(`${enteredAt}:400 ?<Log> ${CTX} CGameContext::IsEndedHole: Player[0]: State: 0, Shot: 0`);
    if (holedOutAt) lines.push(`${holedOutAt}:500 ?<Log> ${CTX} CGameContext::IsEndedHole: Player[0]: State: 1, Shot: 3`);
  });
  return lines;
}

const GAME_18 = game("Yecheon_CD", [
  ["23:46:23", "23:47:25"], ["23:47:28", "23:49:05"], ["23:49:08", "23:50:27"], ["23:50:30", "23:51:10"],
  ["23:51:13"], ["23:51:21"], ["23:51:43"], ["23:51:50"], ["23:51:54"], ["23:52:17"], ["23:52:22"], ["23:52:30"],
  ["23:52:35"], ["23:52:42"], ["23:52:48"], ["23:52:57"], ["23:53:02"], ["23:53:08", "23:53:53"]
]);
const GAME_9 = game("Songdo_AB", [
  ["23:55:44", "23:56:38"], ["23:56:41", "23:57:53"], ["23:57:56", "23:58:36"], ["23:58:39"], ["23:58:53"],
  ["23:58:59"], ["23:59:04"], ["23:59:09", "00:01:28"], ["00:01:31", "00:02:55"], ["00:03:15"]
]);
const MAIN_NAME = "main_2026_11_25_23_36_05.log";
const MAIN_TEXT = ["23:36:05:010 ?<Log> [D:\\Dev\\Golf\\SG2024x\\Source\\Main.cpp 12] start", ...GAME_18,
  "23:55:30:000 ?<Log> [D:\\Dev\\Golf\\SG2024x\\Source\\Ui.cpp 44] lobby", ...GAME_9].join("\r\n");

const bits = (...holes) => holes.reduce((mask, hole) => mask | (1 << (hole - 1)), 0);
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

// ScreenGolf.log(UTC) 실측: 코스 진입 14:46:24.524 / 로비 14:55:32.589 / 코스 진입 14:55:45.621 / 로비 15:03:30.808.
// Agent 관측 시각은 감시 주기만큼 늦다(+1.5초로 둔다).
const TELEMETRY = [
  { gameState: "playing", gameMode: "regular", courseId: "Yecheon_CD", observedAt: "2026-11-25T14:46:26.000Z" },
  { gameState: "menu", gameMode: "lobby", observedAt: "2026-11-25T14:55:34.000Z" },
  { gameState: "playing", gameMode: "regular", courseId: "Songdo_AB", observedAt: "2026-11-25T14:55:47.000Z" },
  { gameState: "menu", gameMode: "lobby", observedAt: "2026-11-25T15:03:32.000Z" }
];

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "vista-hole-"));
}

test("main 로그를 판별 홀 묶음으로 나누고 KST 시각을 UTC 로, 자정 넘김을 다음 날로 바꾼다", () => {
  const runs = parseMainLogRuns(MAIN_TEXT, MAIN_NAME, { utcOffsetMinutes: KST });
  assert.equal(runs.length, 2);
  assert.deepEqual(runs[0], {
    startedAt: "2026-11-25T14:46:23.120Z", enteredMask: bits(...range(1, 18)), endedMask: bits(1, 2, 3, 4, 18)
  });
  assert.deepEqual(runs[1], {
    startedAt: "2026-11-25T14:55:44.120Z", enteredMask: bits(...range(1, 10)), endedMask: bits(1, 2, 3, 8, 9)
  });

  // 00:01 줄이 다음 날(11-26 KST = 11-25 15:01 UTC)로 읽혀야 다음 묶음이 잘못 열리지 않는다
  const late = parseMainLogRuns(game("A", [["23:59:50"], ["00:00:10", "00:01:00"]]).join("\n"), "main_2026_11_25_23_50_00.log", { utcOffsetMinutes: KST });
  assert.equal(late.length, 1);
  assert.equal(late[0].enteredMask, bits(1, 2));
});

test("밤새 켜 둔 게임: 20:00 다음 줄이 09:00 이면 다음 날이다", () => {
  const text = [...game("A", [["20:00:00", "20:01:00"]]), ...game("B", [["09:00:00"], ["09:05:00"]])].join("\n");
  const runs = parseMainLogRuns(text, "main_2026_11_25_19_00_00.log", { utcOffsetMinutes: KST });
  assert.deepEqual(runs.map((run) => run.startedAt), ["2026-11-25T11:00:00.120Z", "2026-11-26T00:00:00.120Z"]);
});

test("1홀만 하고 로비로 나간 판은 다음 판과 합치지 않는다", () => {
  const text = [...game("A", [["10:00:00"]]), ...game("B", range(1, 10).map((hole) => [`10:${pad(hole)}:20`, hole <= 9 ? `10:${pad(hole)}:50` : null]))].join("\n");
  const runs = parseMainLogRuns(text, "main_2026_11_26_09_00_00.log", { utcOffsetMinutes: KST });
  assert.deepEqual(runs.map((run) => [run.enteredMask, run.endedMask]), [[bits(1), 0], [bits(...range(1, 10)), bits(...range(1, 9))]]);
  // 30초 안에 다음 판을 시작해 두 라운드 창이 겹쳐도 시작이 가까운 쪽에 붙는다
  const assigned = assignRunsToRounds([
    { roundId: "a", startedAt: "2026-11-26T01:00:01.000Z", endedAt: "2026-11-26T01:00:10.000Z" },
    { roundId: "b", startedAt: "2026-11-26T01:00:30.000Z", endedAt: "2026-11-26T01:20:00.000Z" }
  ], [{ ...runs[0] }, { ...runs[1], startedAt: "2026-11-26T01:00:29.000Z" }]);
  assert.deepEqual(assigned.get("a"), [{ enteredMask: bits(1), endedMask: 0 }]);
  assert.deepEqual(assigned.get("b"), [{ enteredMask: bits(...range(1, 10)), endedMask: bits(...range(1, 9)) }]);
});

test("다시하기(이미 지난 홀에 재진입)와 중복 줄을 구분한다", () => {
  const text = [
    ...game("A", [["10:00:00", "10:01:00"], ["10:02:00"], ["10:03:00"]]),
    `10:03:00:900 ?<Log> ${SRC} GameManager::EnterNewHole: Enter New Hole - [A] 03hole`,
    `10:04:00:300 ?<Log> ${SRC} GameManager::EnterNewHole: Enter New Hole - [A] 02hole`
  ].join("\n");
  const runs = parseMainLogRuns(text, "main_2026_11_26_09_00_00.log", { utcOffsetMinutes: KST });
  assert.deepEqual(runs.map((run) => [run.enteredMask, run.endedMask]), [[bits(1, 2, 3), bits(1)], [bits(2), 0]]);
});

test("연속 두 판(로비 12초 뒤 다음 판 홀1)도 각자의 라운드에 붙는다", () => {
  const rounds = [
    { roundId: "r1", startedAt: "2026-11-25T14:46:26.000Z", endedAt: "2026-11-25T14:55:34.000Z" },
    { roundId: "r2", startedAt: "2026-11-25T14:55:47.000Z", endedAt: "2026-11-25T15:03:32.000Z" }
  ];
  const assigned = assignRunsToRounds(rounds, parseMainLogRuns(MAIN_TEXT, MAIN_NAME, { utcOffsetMinutes: KST }));
  assert.deepEqual(assigned.get("r1"), [{ enteredMask: bits(...range(1, 18)), endedMask: bits(1, 2, 3, 4, 18) }]);
  assert.deepEqual(assigned.get("r2"), [{ enteredMask: bits(...range(1, 10)), endedMask: bits(1, 2, 3, 8, 9) }]);
});

test("원장 → main 로그 대조: 잠겨 있으면 기다리고, 열리면 같은 roundId 로 개정 3, 재시작 5회에도 1건", async () => {
  const dir = tempDir();
  const logDir = path.join(dir, "Logs");
  fs.mkdirSync(logDir);
  const ledgerPath = path.join(dir, "ledger.json");
  const outboxPath = path.join(dir, "outbox.json");
  const open = () => {
    const outbox = createRoundReportOutbox({ filePath: outboxPath, bayCode: "A-02" });
    const ledger = createRoundLedger({ filePath: ledgerPath, agentVersion: "0.10.1", onReport: (report) => outbox.enqueue(report) });
    return { outbox, ledger };
  };
  try {
    let { ledger, outbox } = open();
    for (const telemetry of TELEMETRY) ledger.observe(telemetry);
    assert.equal(ledger.pendingHoleRounds().length, 2);
    const [r1, r2] = ledger.pendingHoleRounds().map((round) => round.roundId);

    // 게임 실행 중: main 로그가 잠겨 열리지 않는다(디렉터리로 흉내). 아무것도 확정하지 않는다.
    fs.mkdirSync(path.join(logDir, MAIN_NAME));
    assert.deepEqual(await reconcileHoleLogs({ ledger, logDirectory: logDir, utcOffsetMinutes: KST }), { completed: 0, locked: 1, unmatchedRuns: 0, unpairedRounds: 0 });
    assert.equal(ledger.pendingHoleRounds().length, 2);
    fs.rmdirSync(path.join(logDir, MAIN_NAME));
    fs.writeFileSync(path.join(logDir, MAIN_NAME), MAIN_TEXT, "utf8");

    // 대조 직전 원장 상태를 남겨 두었다가, 개정 3을 outbox 에 넣은 뒤 원장 저장 전에 꺼진 것처럼 되돌린다.
    const beforeReconcile = fs.readFileSync(ledgerPath, "utf8");
    for (let restart = 0; restart < 5; restart += 1) {
      fs.writeFileSync(ledgerPath, beforeReconcile, "utf8");
      ({ ledger, outbox } = open());
      // 재시작 직후 같은 로비 상태를 다시 관측해도 새 보고가 생기지 않는다
      ledger.observe({ ...TELEMETRY[3], observedAt: "2026-11-25T15:04:00.000Z" });
      await reconcileHoleLogs({ ledger, logDirectory: logDir, utcOffsetMinutes: KST });
      assert.equal(ledger.pendingHoleRounds().length, 0);
    }

    const pending = outbox.list(10);
    assert.deepEqual(pending.map((report) => [report.roundId, report.revision, report.holeSource]), [
      [r1, 3, "native_log"], [r2, 3, "native_log"]
    ]);
    // 서버 행 키(agent, roundId)로 모으면 판마다 1행
    assert.equal(new Set(pending.map((report) => report.roundId)).size, 2);
    assert.deepEqual(pending[1].runs, [{ enteredMask: bits(...range(1, 10)), endedMask: bits(1, 2, 3, 8, 9) }]);
    assert.equal(pending[1].endedAt, "2026-11-25T15:03:32.000Z");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("23:58 시작 00:07 종료 판은 종료 시각이 다음 날(KST)로 보고된다", async () => {
  const dir = tempDir();
  try {
    const name = "main_2026_11_25_23_50_00.log";
    const holes = range(1, 9).map((hole) => [`${hole < 3 ? "23:5" + (7 + hole) : "00:0" + (hole - 3)}:10`, hole === 9 ? "00:06:50" : null]);
    fs.writeFileSync(path.join(dir, name), game("Songdo_AB", holes).join("\n"), "utf8");
    const reports = [];
    const ledger = createRoundLedger({ filePath: path.join(dir, "ledger.json"), agentVersion: "0.10.1", onReport: (r) => reports.push(r) });
    ledger.observe({ gameState: "playing", gameMode: "regular", courseId: "Songdo_AB", observedAt: "2026-11-25T14:58:12.000Z" });
    ledger.observe({ gameState: "menu", gameMode: "lobby", observedAt: "2026-11-25T15:07:00.000Z" });
    await reconcileHoleLogs({ ledger, logDirectory: dir, utcOffsetMinutes: KST });
    const final = reports.at(-1);
    assert.equal(final.revision, 3);
    assert.deepEqual(final.runs, [{ enteredMask: bits(...range(1, 9)), endedMask: bits(9) }]);
    assert.equal(final.endedAt, "2026-11-25T15:07:00.000Z"); // = 2026-11-26 00:07 KST
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("줄 없이 24시간 넘게 지나 날짜가 하루 덜 세어져도 짝 없는 라운드에만 +1일로 붙이고, 남은 묶음 수를 남긴다", async () => {
  const dir = tempDir();
  try {
    // 11-24 10:00 판 → (줄 없이 하루 넘게) → 11-25 11:00 판 → 11-25 15:00 Agent 가 모르는 판. 파서는 뒤 두 판을 11-24 로 읽는다.
    const text = [...game("A", [["10:00:00", "10:01:00"], ["10:02:00"]]), ...game("B", [["11:00:00"], ["11:05:00"]]), ...game("C", [["15:00:00"]])];
    fs.writeFileSync(path.join(dir, "main_2026_11_24_09_00_00.log"), text.join("\n"), "utf8");
    const reports = [];
    const ledger = createRoundLedger({ filePath: path.join(dir, "ledger.json"), agentVersion: "0.10.1", onReport: (r) => reports.push(r) });
    ledger.observe({ gameState: "playing", gameMode: "regular", courseId: "A", observedAt: "2026-11-24T01:00:01.000Z" });
    ledger.observe({ gameState: "menu", gameMode: "lobby", observedAt: "2026-11-24T01:03:00.000Z" });
    ledger.observe({ gameState: "playing", gameMode: "regular", courseId: "B", observedAt: "2026-11-25T02:00:01.000Z" });
    ledger.observe({ gameState: "menu", gameMode: "lobby", observedAt: "2026-11-25T02:06:00.000Z" });
    const result = await reconcileHoleLogs({ ledger, logDirectory: dir, utcOffsetMinutes: KST });
    assert.deepEqual(result, { completed: 2, locked: 0, unmatchedRuns: 1, unpairedRounds: 0 });
    const finals = reports.filter((r) => r.revision === 3);
    assert.deepEqual(finals.map((r) => [r.courseId, r.runs]), [
      ["A", [{ enteredMask: bits(1, 2), endedMask: bits(1) }]],
      ["B", [{ enteredMask: bits(1, 2), endedMask: 0 }]]
    ]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("홀 줄을 하나도 못 짝지으면 개정 3을 보내지 않고 대기만 끝낸다", async () => {
  const dir = tempDir();
  try {
    fs.writeFileSync(path.join(dir, "main_2026_11_26_10_00_00.log"), "10:00:01:000 start\n", "utf8");
    const reports = [];
    const ledger = createRoundLedger({ filePath: path.join(dir, "ledger.json"), agentVersion: "0.10.1", onReport: (r) => reports.push(r) });
    ledger.observe({ gameState: "playing", gameMode: "regular", courseId: "A", observedAt: "2026-11-26T01:10:00.000Z" });
    ledger.observe({ gameState: "menu", gameMode: "lobby", observedAt: "2026-11-26T01:20:00.000Z" });
    await reconcileHoleLogs({ ledger, logDirectory: dir, utcOffsetMinutes: KST });
    assert.deepEqual(reports.map((r) => r.revision), [1, 2]);
    assert.equal(ledger.pendingHoleRounds().length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
