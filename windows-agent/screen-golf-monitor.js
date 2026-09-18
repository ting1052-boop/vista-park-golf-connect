/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs/promises");
const { randomUUID } = require("node:crypto");

const COURSE_BROWSE = /Browse:\s*\/Game\/Golf\/Course\/([^/?\s]+)(?:\/[^?\s]+)?/iu;
const LOBBY_BROWSE = /Browse:\s*.*\/UIMap(?:\?|\s|$)/iu;
const EXCLUDED_MAP_PATTERN = /^(?:Practice_|Tutorial_|Test_)/iu;

function classifyCourse(courseId) {
  if (!courseId) return "unknown";
  if (/^Practice_/iu.test(courseId)) return "practice";
  if (EXCLUDED_MAP_PATTERN.test(courseId)) return "excluded";
  return "regular";
}

function parseScreenGolfEvents(text) {
  const events = [];
  for (const line of String(text).split(/\r?\n/)) {
    const courseMatch = COURSE_BROWSE.exec(line);
    if (courseMatch) {
      const courseId = courseMatch[1];
      events.push({ type: "course_entered", courseId, gameMode: classifyCourse(courseId) });
      continue;
    }
    if (/Game class is 'SGGameModeBase_C'/iu.test(line)) events.push({ type: "game_mode_seen" });
    if (/Game class is 'BP_LobbyModebase_C'/iu.test(line) || LOBBY_BROWSE.test(line)) events.push({ type: "lobby_entered" });
    if (/FPlatformMisc::RequestExit\(0\)/u.test(line)) events.push({ type: "exit_requested" });
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
  // 게임을 다른 폴더로 재설치해도 따라가도록, 고정 경로 대신 후보 중에서
  // 가장 최근에 쓰인 로그를 고른다. locator 를 주지 않으면 기존처럼 한 경로만 본다.
  const locator = options.locator ?? null;
  const staticLogFile = String(options.logFile ?? "").trim();
  let logFile = staticLogFile;
  const maxReadBytes = Math.max(16_384, Math.min(1_048_576, Number(options.maxReadBytes ?? 262_144)));
  const onDiagnostic = typeof options.onDiagnostic === "function" ? options.onDiagnostic : () => {};
  const onRoundEnded = typeof options.onRoundEnded === "function" ? options.onRoundEnded : () => {};
  let processWasRunning = false;
  let initialized = false;
  let offset = 0;
  let carry = "";
  let state = null;
  let contextEpoch = 0;
  let gameInstanceId = null;
  let lastUnavailableCode = null;
  let lastUnavailableLoggedAt = 0;

  function resetRuntime() {
    processWasRunning = false;
    initialized = false;
    offset = 0;
    carry = "";
    state = null;
    contextEpoch += 1;
    gameInstanceId = null;
  }

  function enterCourse(event, observedAt) {
    if (state?.gameState === "playing" && state?.courseId === event.courseId && state?.gameMode === event.gameMode) return;
    contextEpoch += 1;
    const counted = event.gameMode === "regular";
    state = {
      gameState: event.gameMode === "practice" ? "practice" : "playing",
      gameMode: event.gameMode,
      courseId: event.courseId,
      currentHole: null,
      holeStatus: counted ? "unknown" : "not_applicable",
      holeSource: null,
      holeObservedAt: null,
      lastKnownHole: null,
      lastKnownHoleAt: null,
      roundStatus: counted ? "in_progress" : "not_applicable",
      roundId: counted ? randomUUID() : null,
      gameInstanceId,
      contextEpoch,
      stateSource: "log",
      confidence: "high",
      reasonCode: event.gameMode === "practice" ? "practice_map" : event.gameMode === "excluded" ? "excluded_map" : null,
      observedAt
    };
  }

  function enterLobby(observedAt) {
    if (state?.gameState === "menu") return;
    const previous = state;
    contextEpoch += 1;
    const returnedFromRound = previous?.gameMode === "regular" && previous?.roundStatus === "in_progress" && previous?.roundId;
    if (returnedFromRound) {
      onRoundEnded({
        eventId: randomUUID(), roundId: previous.roundId, eventType: "returned_to_lobby",
        courseId: previous.courseId ?? null, occurredAt: observedAt, completionKind: "unverified",
        lastKnownHole: previous.lastKnownHole ?? previous.currentHole ?? null,
        lastKnownHoleAt: previous.lastKnownHoleAt ?? previous.holeObservedAt ?? null, source: "log"
      });
    }
    state = {
      gameState: "menu", gameMode: "lobby", courseId: null, currentHole: null,
      holeStatus: "not_applicable", holeSource: null, holeObservedAt: null,
      lastKnownHole: previous?.lastKnownHole ?? previous?.currentHole ?? null,
      lastKnownHoleAt: previous?.lastKnownHoleAt ?? previous?.holeObservedAt ?? null,
      roundStatus: returnedFromRound ? "ended_unclassified" : "not_started", roundId: null,
      gameInstanceId, contextEpoch, stateSource: "log", confidence: "high",
      reasonCode: returnedFromRound ? "returned_to_lobby" : null, observedAt
    };
  }

  function applyEvents(events, observedAt) {
    for (const event of events) {
      if (event.type === "course_entered") enterCourse(event, observedAt);
      else if (event.type === "game_mode_seen" && !state) {
        contextEpoch += 1;
        state = {
          gameState: "playing", gameMode: "unknown", courseId: null, currentHole: null,
          holeStatus: "unknown", holeSource: null, holeObservedAt: null, lastKnownHole: null,
          lastKnownHoleAt: null, roundStatus: "unknown", roundId: null, gameInstanceId,
          contextEpoch, stateSource: "log", confidence: "medium", reasonCode: "course_unclassified", observedAt
        };
      } else if (event.type === "lobby_entered") enterLobby(observedAt);
      else if (event.type === "exit_requested") {
        const activeRound = state?.roundStatus === "in_progress";
        contextEpoch += 1;
        state = {
          ...(state ?? {}), gameState: "exiting", gameMode: state?.gameMode ?? "unknown", currentHole: null,
          holeStatus: "not_applicable", holeSource: null, holeObservedAt: null,
          roundStatus: activeRound ? "aborted" : state?.roundStatus ?? "not_started",
          gameInstanceId, contextEpoch, stateSource: "log", confidence: "high",
          reasonCode: activeRound ? "exit_during_round" : null, observedAt
        };
      }
    }
  }

  function applyHoleObservation(observation) {
    if (!state || state.gameMode !== "regular" || state.roundStatus !== "in_progress") return state;
    if (!observation || observation.contextEpoch !== state.contextEpoch) return state;
    state = { ...state, ...observation, gameInstanceId, stateSource: "mixed", observedAt: observation.observedAt ?? state.observedAt };
    return state;
  }

  async function observe(gameRunning) {
    if (gameRunning === false) {
      if (processWasRunning || state !== null) resetRuntime();
      return {
        gameState: "not_running", gameMode: "none", courseId: null, currentHole: null,
        holeStatus: "not_applicable", holeSource: null, holeObservedAt: null, lastKnownHole: null,
        lastKnownHoleAt: null, roundStatus: "not_started", roundId: null, gameInstanceId: null,
        contextEpoch, stateSource: "process", confidence: "high", reasonCode: null, observedAt: new Date().toISOString()
      };
    }
    if (gameRunning !== true) return null;
    if (!processWasRunning) {
      processWasRunning = true;
      initialized = false;
      offset = 0;
      carry = "";
      state = null;
      gameInstanceId = randomUUID();
      contextEpoch += 1;
    }
    if (locator) {
      const resolved = await locator.resolve();
      if (resolved && resolved !== logFile) {
        // 다른 설치본으로 옮겨갔다. 새 파일을 처음부터 따라가되 과거 내용은 읽지 않는다.
        onDiagnostic({
          event: "screen_golf_log_switched",
          previous: logFile || null,
          current: resolved,
          observedAt: new Date().toISOString()
        });
        logFile = resolved;
        initialized = false;
        offset = 0;
        carry = "";
        state = null;
      } else if (resolved) {
        logFile = resolved;
      }
    }

    if (!logFile) return null;

    try {
      const stat = await fs.stat(logFile);
      if (!stat.isFile()) return null;
      let start = offset;
      if (!initialized || stat.size < offset) {
        start = stat.size;
        carry = "";
        state = null;
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
        const observedAt = new Date().toISOString();
        applyEvents(events, observedAt);
        if (events.length > 0 || truncated) {
          onDiagnostic({ event: "screen_golf_state_scan", detectedEvents: events.map((item) => item.type), truncated, observedAt });
        }
      }
    } catch (error) {
      const errorCode = error?.code ?? "unknown";
      const now = Date.now();
      if (errorCode !== lastUnavailableCode || now - lastUnavailableLoggedAt >= 300_000) {
        lastUnavailableCode = errorCode;
        lastUnavailableLoggedAt = now;
        onDiagnostic({ event: "screen_golf_log_unavailable", errorCode, observedAt: new Date(now).toISOString() });
      }
      return null;
    }
    return state;
  }

  return { observe, reset: resetRuntime, applyHoleObservation, getState: () => state };
}

module.exports = { classifyCourse, createScreenGolfMonitor, parseScreenGolfEvents };
