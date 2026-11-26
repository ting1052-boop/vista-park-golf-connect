/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs/promises");
const path = require("node:path");

// 홀 사실: ScreenGolf\Binaries\Win64\Logs\main_YYYY_MM_DD_HH_MM_SS.log (설계서 §6.4)
// 줄 모양은 2026-11-25 시흥 A-02 수집 결과(fixtures/round-evidence)에서만 가져왔다.
//  - 파일 이름 = 게임 실행 시각(PC 현지 시각). 줄 앞머리는 "HH:MM:SS:fff" 현지 시각뿐(날짜 없음)
//  - 판의 첫 홀: "GameManager::EnterNewHole: Open New Level - [...]" (홀 번호 없음)
//  - 2번 홀부터: "GameManager::EnterNewHole: ... New Hole - [...] 02hole"
//  - "CGameContext::IsEndedHole: Player[0]: State: 1" = 공을 넣어 끝낸 홀(홀아웃). 건너뛴 홀은 State 0 만 나온다
// 게임 실행 중에는 파일이 잠겨 있다. 열리지 않으면 건너뛰고 다음 기회에 본다(우회하지 않는다).

const MAIN_LOG_NAME = /^main_(\d{4})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})\.log$/iu;
const LINE_TIME = /^(\d{2}):(\d{2}):(\d{2}):(\d{3})/u;
const OPEN_LEVEL = /GameManager::EnterNewHole:\s*Open New Level/iu;
const NEW_HOLE = /GameManager::EnterNewHole:.*\bNew Hole\b.*?(\d{1,2})\s*hole\b/iu;
const HOLED_OUT = /CGameContext::IsEndedHole:.*\bState:\s*1\b/iu;

const DAY_MS = 86_400_000;
// 시각이 이만큼 넘게 거꾸로 가면 자정을 넘긴 것으로 본다(줄 순서가 살짝 섞인 것만 흡수).
// ponytail: 줄 없이 24시간 넘게 지나면 날짜를 하루 덜 센다. 대기 화면에서도 줄이 찍히는지 현장 확인 후 필요하면 파일 수정 시각으로 보정.
const MIDNIGHT_JUMP_MS = 60_000;
// 같은 첫 홀 줄이 이 안에 다시 나오면(여러 명·중복 줄) 같은 판으로 본다.
const DUPLICATE_OPEN_MS = 2_000;
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_RUNS_PER_ROUND = 6;
// 홀 1 줄은 ScreenGolf.log 코스 진입 줄보다 1~2초 먼저 찍힌다(실측). Agent 관측 시각 지연까지 넉넉히 둔다.
const RUN_START_BEFORE_ROUND_MS = 30_000;
// 라운드가 닫힌(로비 관측) 뒤에 시작한 묶음은 다음 판이다. 실측 간격 12초라 짧게 둔다.
const RUN_START_AFTER_ROUND_END_MS = 5_000;

/** 현지 시각(달력 값)을 UTC ms 로. utcOffsetMinutes 를 주면 그 값, 없으면 이 PC 의 시간대를 쓴다. */
function localToUtcMs(naiveMs, utcOffsetMinutes) {
  if (Number.isFinite(utcOffsetMinutes)) return naiveMs - utcOffsetMinutes * 60_000;
  const t = new Date(naiveMs);
  return new Date(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), t.getUTCHours(), t.getUTCMinutes(),
    t.getUTCSeconds(), t.getUTCMilliseconds()).getTime();
}

/** 파일 이름의 실행 시각(현지 달력 값, UTC 로 해석한 ms). 이름이 다르면 null */
function mainLogNaiveStart(fileName) {
  const m = MAIN_LOG_NAME.exec(fileName);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  return Date.UTC(y, mo - 1, d, h, mi, s);
}

/**
 * main 로그 한 파일을 홀 진행 묶음(run)으로 나눈다.
 * 묶음 = 한 판의 홀 진행. "Open New Level"(첫 홀) 또는 이미 들어간 홀에 다시 들어가면 새 묶음.
 * 반환 시각은 UTC ISO.
 */
function parseMainLogRuns(text, fileName, { utcOffsetMinutes } = {}) {
  const naiveStart = mainLogNaiveStart(fileName);
  if (naiveStart === null) return [];
  const dayStart = naiveStart - (naiveStart % DAY_MS);
  let dayOffset = 0;
  let previousTod = naiveStart - dayStart;
  const runs = [];
  let run = null;

  for (const line of String(text).split(/\r?\n/u)) {
    const t = LINE_TIME.exec(line);
    if (!t) continue;
    const tod = ((Number(t[1]) * 60 + Number(t[2])) * 60 + Number(t[3])) * 1000 + Number(t[4]);
    if (tod < previousTod - MIDNIGHT_JUMP_MS) dayOffset += 1;
    previousTod = tod;
    const at = localToUtcMs(dayStart + dayOffset * DAY_MS + tod, utcOffsetMinutes);

    let hole = null;
    if (OPEN_LEVEL.test(line)) hole = 1;
    else {
      const m = NEW_HOLE.exec(line);
      if (m) hole = Number(m[1]);
    }

    if (hole !== null && hole >= 1 && hole <= 18) {
      const bit = 1 << (hole - 1);
      // 첫 홀(Open New Level)은 새 판. 2초 안의 중복 줄만 같은 판으로 본다(1홀만 하고 나간 판을 다음 판에 합치지 않게).
      // 번호 있는 홀은 같은 홀 줄 반복은 무시하고, 이미 지난 홀에 다시 들어가면 다시하기로 보고 새 묶음.
      const restart = OPEN_LEVEL.test(line)
        ? !(run && run.enteredMask === 1 && at - run.startMs <= DUPLICATE_OPEN_MS)
        : run !== null && hole !== run.lastHole && (run.enteredMask & bit) !== 0;
      if (!run || restart) {
        run = { startMs: at, enteredMask: 0, endedMask: 0, lastHole: hole };
        runs.push(run);
      }
      run.enteredMask |= bit;
      run.lastHole = hole;
    } else if (run && HOLED_OUT.test(line)) {
      run.endedMask |= 1 << (run.lastHole - 1);
    }
  }

  return runs.map((item) => ({
    startedAt: new Date(item.startMs).toISOString(),
    enteredMask: item.enteredMask,
    endedMask: item.endedMask
  }));
}

/**
 * 묶음을 라운드에 붙인다. 묶음 시작이 [라운드 시작 - 30초, 라운드 끝 + 5초] 안에 들어야 하고,
 * 여러 라운드가 맞으면 시작 시각이 가장 가까운 라운드를 고른다(연속 두 판: 앞 판 로비 23:55:32, 다음 판 홀1 23:55:44).
 * Agent 가 모르는 판(Agent 꺼짐 등)의 묶음은 어디에도 붙지 않는다.
 */
function bestRound(rounds, start) {
  let best = null;
  for (const round of rounds) {
    const roundStart = Date.parse(round.startedAt);
    const roundEnd = Date.parse(round.endedAt);
    if (start < roundStart - RUN_START_BEFORE_ROUND_MS || start > roundEnd + RUN_START_AFTER_ROUND_END_MS) continue;
    if (!best || Math.abs(start - roundStart) < Math.abs(start - Date.parse(best.startedAt))) best = round;
  }
  return best;
}

/** 반환: roundId → 묶음 목록. unmatched = 어느 라운드에도 붙지 않은 묶음(시작 ms 포함). */
function matchRuns(rounds, runs) {
  const byRound = new Map(rounds.map((round) => [round.roundId, []]));
  let unmatched = [];
  for (const run of runs) {
    const start = Date.parse(run.startedAt);
    const best = bestRound(rounds, start);
    if (best) byRound.get(best.roundId).push({ enteredMask: run.enteredMask, endedMask: run.endedMask });
    else unmatched.push({ ...run, start });
  }
  // 날짜 보정: 줄 없이 24시간 넘게 지났거나(하루 덜 셈) 시계가 거꾸로 1분 넘게 튀면(하루 더 셈) 날짜가 하루 어긋난다.
  // 짝이 하나도 없는 라운드에만, 어디에도 안 붙은 묶음만 ±1일 옮겨 다시 본다. 이미 붙은 묶음은 건드리지 않아 이중 집계가 없다.
  for (const shift of [DAY_MS, -DAY_MS]) {
    const empty = rounds.filter((round) => byRound.get(round.roundId).length === 0);
    if (empty.length === 0 || unmatched.length === 0) break;
    const still = [];
    for (const run of unmatched) {
      const best = bestRound(empty, run.start + shift);
      if (best) byRound.get(best.roundId).push({ enteredMask: run.enteredMask, endedMask: run.endedMask });
      else still.push(run);
    }
    unmatched = still;
  }
  return { byRound, unmatched: unmatched.length };
}

function assignRunsToRounds(rounds, runs) {
  return matchRuns(rounds, runs).byRound;
}

/**
 * 원장의 닫힌 라운드를 main 로그와 대조한다.
 * 라운드마다 "시작 시각 이전에 만들어진 가장 늦은 main 로그"가 그 실행의 로그다. 그 파일이 열리면(=게임이 그 실행을 끝냄)
 * 묶음을 짝지어 ledger.completeHoleRound 로 넘긴다. 잠겨 있으면 그대로 두고 다음에 다시 본다.
 */
async function reconcileHoleLogs({ ledger, logDirectory, utcOffsetMinutes, now = Date.now() }) {
  const pending = ledger.pendingHoleRounds();
  if (pending.length === 0 || !logDirectory) return { completed: 0, locked: 0 };

  let names;
  try {
    names = await fs.readdir(logDirectory);
  } catch {
    return { completed: 0, locked: 0 };
  }
  const files = names
    .map((name) => ({ name, naive: mainLogNaiveStart(name) }))
    .filter((file) => file.naive !== null)
    .map((file) => ({ ...file, startMs: localToUtcMs(file.naive, utcOffsetMinutes) }))
    .sort((a, b) => a.startMs - b.startMs);

  const groups = new Map();
  for (const round of pending) {
    const roundStart = Date.parse(round.startedAt);
    const file = files.filter((item) => item.startMs <= roundStart).at(-1);
    if (!file) {
      // ponytail: 로그 보존(약 89일)보다 오래 기다린 라운드만 여기 온다. 31일 지나면 서버도 거절하므로 버린다.
      if (now - roundStart > 31 * DAY_MS) ledger.completeHoleRound(round.roundId, null);
      continue;
    }
    if (!groups.has(file.name)) groups.set(file.name, []);
    groups.get(file.name).push(round);
  }

  let completed = 0;
  let locked = 0;
  let unmatchedRuns = 0;
  let unpairedRounds = 0;
  for (const [name, rounds] of groups) {
    let text;
    try {
      const filePath = path.join(logDirectory, name);
      const stat = await fs.stat(filePath);
      if (stat.size > MAX_FILE_BYTES) {
        for (const round of rounds) ledger.completeHoleRound(round.roundId, null);
        continue;
      }
      text = await fs.readFile(filePath, "utf8");
    } catch {
      locked += 1;
      continue;
    }
    const { byRound, unmatched } = matchRuns(rounds, parseMainLogRuns(text, name, { utcOffsetMinutes }));
    unmatchedRuns += unmatched;
    for (const round of rounds) {
      const runs = byRound.get(round.roundId);
      // 묶음이 없으면 근거 없음으로 끝낸다(개정 2 그대로 = 확인 대기). 추측으로 채우지 않는다.
      if (runs.length === 0) unpairedRounds += 1;
      ledger.completeHoleRound(round.roundId, runs.length > 0 ? runs.slice(0, MAX_RUNS_PER_ROUND) : null);
      completed += 1;
    }
  }
  // unmatchedRuns: Agent 가 모르는 판(Agent 꺼짐)이거나 날짜 보정으로도 못 붙인 묶음. 현장 진단용.
  return { completed, locked, unmatchedRuns, unpairedRounds };
}

module.exports = { assignRunsToRounds, parseMainLogRuns, reconcileHoleLogs };
