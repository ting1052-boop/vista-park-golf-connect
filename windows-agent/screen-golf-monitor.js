/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("node:fs/promises");

// 2026-09-15 A-02 실측으로 확인한 것만 상태로 만든다.
//
// - 코스 진입은 `Browse: /Game/Golf/Course/<맵>/` 한 줄로 판별한다. 맵 이름이
//   Practice_ 로 시작하면 연습장이므로 라운드로 세지 않는다.
// - `SGGameModeBase_C` 는 연습장과 정규 라운드가 함께 쓰므로 단독으로는
//   라운드 진입 근거가 되지 못한다. 직전 코스 판별을 확인해 주는 보조 신호로만 쓴다.
// - 홀 번호는 실행 중 잠기는 native 로그에만 있어 여기서는 만들지 않는다.

const PRACTICE_MAP_PATTERN = /^(?:Practice_|Tutorial_|Test_)/iu;

function parseScreenGolfEvents(text) {
  const events = [];

  for (const line of String(text).split(/\r?\n/)) {
    const course = /Browse:\s*\/Game\/Golf\/Course\/([^/?\s]+)/iu.exec(line);
    if (course) {
      const mapName = course[1];
      events.push(PRACTICE_MAP_PATTERN.test(mapName) ? "practice_entered" : "round_entered");
      continue;
    }

    if (/Game class is 'SGGameModeBase_C'/iu.test(line)) {
      events.push("game_mode_entered");
      continue;
    }

    if (/Game class is 'BP_LobbyModebase_C'|Browse:\s*.*\/UIMap(?:\?|\s|$)/iu.test(line)) {
      events.push("lobby_entered");
      continue;
    }

    if (/FPlatformMisc::RequestExit\(0\)/u.test(line)) {
      events.push("exit_requested");
    }
  }

  return events;
}

async function readBytes(filePath, start, length) {
  if (length <= 0) return Buffer.alloc(0);
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    const result = await handle.read(buffer, 0, length, start);
    return buffer.subarray(0, result.bytesRead);
  } finally {
    await handle.close();
  }
}

function createScreenGolfMonitor(options = {}) {
  const logFile = String(options.logFile ?? "").trim();
  const maxReadBytes = Math.max(16_384, Math.min(1_048_576, Number(options.maxReadBytes ?? 262_144)));
  const onDiagnostic = typeof options.onDiagnostic === "function" ? options.onDiagnostic : () => {};
  let processWasRunning = false;
  let initialized = false;
  let offset = 0;
  let carry = "";
  let state = null;
  let lastUnavailableCode = null;
  let lastUnavailableLoggedAt = 0;

  function reset() {
    processWasRunning = false;
    initialized = false;
    offset = 0;
    carry = "";
    state = null;
  }

  function makeState(patch) {
    return {
      gameState: "menu",
      currentHole: null,
      roundStatus: "not_started",
      stateSource: "mixed",
      confidence: "high",
      reasonCode: null,
      ...patch
    };
  }

  function applyEvents(events) {
    for (const event of events) {
      if (event === "round_entered") {
        // 새 라운드가 시작될 때만 직전 라운드의 결과를 지운다.
        state = makeState({ gameState: "playing", roundStatus: "in_progress" });
        continue;
      }

      if (event === "practice_entered") {
        state = makeState({ gameState: "practice", reasonCode: "practice_map" });
        continue;
      }

      if (event === "game_mode_entered") {
        // 연습장과 정규 라운드가 공용으로 쓰는 신호. 이미 판별된 상태를 바꾸지 않는다.
        continue;
      }

      if (event === "lobby_entered") {
        // 로비 전환 때 두 줄이 연달아 나온다. 확정한 결과를 덮지 않도록
        // 같은 상태의 반복은 그대로 둔다.
        if (state?.roundStatus === "in_progress") {
          state = makeState({
            gameState: "menu",
            roundStatus: "completed",
            reasonCode: "returned_to_lobby"
          });
        } else if (state?.roundStatus === "completed" || state?.gameState === "practice") {
          state = { ...state, gameState: "menu" };
        } else {
          state = makeState({ gameState: "menu" });
        }
        continue;
      }

      if (event === "exit_requested") {
        const leftActiveRound = state?.roundStatus === "in_progress";
        state = makeState({
          gameState: "exiting",
          roundStatus: leftActiveRound ? "aborted" : state?.roundStatus ?? "not_started",
          reasonCode: leftActiveRound ? "exit_during_round" : null
        });
      }
    }
  }

  async function observe(gameRunning) {
    if (gameRunning === false) {
      reset();
      return {
        gameState: "not_running",
        currentHole: null,
        roundStatus: "not_started",
        stateSource: "process",
        confidence: "high",
        reasonCode: null
      };
    }

    if (gameRunning !== true) return null;
    if (!processWasRunning) {
      processWasRunning = true;
      initialized = false;
      offset = 0;
      carry = "";
      state = null;
    }

    if (!logFile) return null;

    try {
      const stat = await fs.stat(logFile);
      if (!stat.isFile()) return null;

      let start;
      if (!initialized || stat.size < offset) {
        // 첫 조회에서는 이전 실행이 남긴 기록을 현재 상태로 오인하지 않도록
        // 파일 끝에서 시작해 새로 쌓이는 줄만 읽는다.
        start = stat.size;
        carry = "";
        state = null;
      } else {
        start = offset;
      }

      const available = Math.max(0, stat.size - start);
      const truncated = available > maxReadBytes;
      if (truncated) {
        start = Math.max(0, stat.size - maxReadBytes);
        carry = "";
        state = null;
      }

      const bytes = await readBytes(logFile, start, Math.min(maxReadBytes, stat.size - start));
      offset = stat.size;
      initialized = true;

      if (bytes.length > 0) {
        const combined = carry + bytes.toString("utf8");
        const lastNewline = Math.max(combined.lastIndexOf("\n"), combined.lastIndexOf("\r"));
        const complete = lastNewline >= 0 ? combined.slice(0, lastNewline + 1) : "";
        carry = lastNewline >= 0 ? combined.slice(lastNewline + 1).slice(-4_096) : combined.slice(-4_096);
        const events = parseScreenGolfEvents(complete);
        applyEvents(events);
        if (events.length > 0 || truncated) {
          onDiagnostic({
            event: "screen_golf_state_scan",
            detectedEvents: events,
            truncated,
            observedAt: new Date().toISOString()
          });
        }
      }
    } catch (error) {
      const errorCode = error?.code ?? "unknown";
      const now = Date.now();
      if (errorCode !== lastUnavailableCode || now - lastUnavailableLoggedAt >= 300_000) {
        lastUnavailableCode = errorCode;
        lastUnavailableLoggedAt = now;
        onDiagnostic({
          event: "screen_golf_log_unavailable",
          errorCode,
          observedAt: new Date(now).toISOString()
        });
      }
      return null;
    }

    return state;
  }

  return { observe, reset };
}

module.exports = { createScreenGolfMonitor, parseScreenGolfEvents };
