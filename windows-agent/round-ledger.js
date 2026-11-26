/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

// ponytail: 대조 대기 상한. 넘치면 오래된 것부터 개정 2(확인 대기)로 남는다. 게임을 며칠씩 안 끄는 매장이 생기면 늘린다.
const MAX_HOLE_PENDING = 200;

// Agent·PC 가 이만큼 넘게 관측하지 못했으면(강제 전원 차단·Agent 종료) 열린 판은 마지막 관측 시각에 끝난 것으로 본다.
const STALE_ACTIVE_MS = 120_000;
// 마지막 관측 시각은 1분마다만 저장한다(2초 주기 쓰기 방지). 그래서 STALE_ACTIVE_MS 는 이 값의 2배다.
const LAST_SEEN_PERSIST_MS = 60_000;

/** 읽을 수 없는 파일은 옆으로 치우고 새로 시작한다(한 PC 의 대기 보고 유실 < 영구 정지). */
function loadJsonState(filePath, isValid) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (isValid(parsed)) return parsed;
  } catch { /* 아래에서 치운다 */ }
  try { fs.renameSync(filePath, `${filePath}.corrupt-${Date.now()}`); } catch { /* 다음 저장이 덮어쓴다 */ }
  return null;
}

/** 전원이 갑자기 끊겨도 빈 파일이 남지 않게 디스크에 내린 뒤 바꿔 끼운다. */
function writeJsonState(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.${process.pid}.tmp`;
  const fd = fs.openSync(temp, "w");
  try {
    fs.writeFileSync(fd, JSON.stringify(value, null, 2), "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temp, filePath);
}

function createRoundLedger({ filePath, agentVersion, onReport, now = Date.now }) {
  const state = loadJsonState(filePath, (parsed) => parsed?.version === 1) ?? { version: 1, active: null };

  function persist() {
    writeJsonState(filePath, state);
  }

  function report(active, closed = null, runs = null) {
    const value = {
      roundId: active.roundId,
      revision: runs ? 3 : closed ? 2 : 1,
      status: closed ? "closed" : "open",
      kind: active.kind,
      courseId: active.courseId,
      startedAt: active.startedAt,
      ...(closed ? { endedAt: closed.endedAt, endKind: closed.endKind } : {}),
      timeBasis: "observed",
      holeSource: runs ? "native_log" : "none",
      runs: runs ?? [],
      agentVersion
    };
    onReport(value);
  }

  function close(endKind, observedAt) {
    if (!state.active) return;
    const active = state.active;
    const durationMs = Date.parse(observedAt) - Date.parse(active.startedAt);
    if (active.kind !== "practice" || durationMs >= 60_000) report(active, { endedAt: observedAt, endKind });
    if (active.kind === "course") {
      // main 로그는 게임이 꺼진 뒤에야 열린다. 대조해서 개정 3을 같은 roundId 로 보낼 때까지 남겨 둔다.
      state.holePending = [...(state.holePending ?? []),
        { roundId: active.roundId, courseId: active.courseId, startedAt: active.startedAt, endedAt: observedAt, endKind }
      ].slice(-MAX_HOLE_PENDING);
    }
    state.active = null;
    persist();
  }

  /** runs 가 null 이면 근거 없음으로 대기만 끝낸다(개정 2 그대로 = 확인 대기). */
  function completeHoleRound(roundId, runs) {
    const pending = state.holePending ?? [];
    const round = pending.find((item) => item.roundId === roundId);
    if (!round) return;
    if (runs) report({ ...round, kind: "course" }, round, runs);
    state.holePending = pending.filter((item) => item.roundId !== roundId);
    persist();
  }

  function observe(telemetry) {
    const observedAt = telemetry?.observedAt || new Date().toISOString();
    // telemetry.observedAt 은 상태가 바뀐 시각이라 판 도중에는 멈춰 있다. 살아 있음은 벽시계로 본다.
    if (state.active) {
      const nowMs = now();
      const seenMs = Date.parse(state.active.lastSeenAt);
      if (!Number.isFinite(seenMs)) {
        // 0.10.0 원장(lastSeenAt 없음): 지금부터 센다. 진행 중인 판을 시작 시각에 닫지 않는다.
        state.active.lastSeenAt = new Date(nowMs).toISOString();
        persist();
      } else if (nowMs - seenMs > STALE_ACTIVE_MS) {
        // 강제 종료 뒤 재시작: 같은 코스로 다시 들어와 있어도 이어 붙이지 않고, 끝 시각(=play_date)을 실제 마지막 관측으로 둔다.
        close("game_exit", new Date(Math.max(seenMs, Date.parse(state.active.startedAt))).toISOString());
      } else if (nowMs - seenMs >= LAST_SEEN_PERSIST_MS) {
        state.active.lastSeenAt = new Date(nowMs).toISOString();
        persist();
      }
    }
    const kind = telemetry?.gameMode === "regular" && telemetry?.gameState === "playing" ? "course" :
      telemetry?.gameMode === "practice" && telemetry?.gameState === "practice" ? "practice" : null;

    if (!kind) {
      if (state.active && ["menu", "not_running", "exiting"].includes(telemetry?.gameState)) {
        close(telemetry.gameState === "menu" ? "returned_to_lobby" : "game_exit", observedAt);
      }
      return;
    }
    const courseId = telemetry.courseId || null;
    if (state.active && (state.active.kind !== kind || state.active.courseId !== courseId)) close("course_changed", observedAt);
    if (state.active) {
      if (state.active.kind === "course" && !state.active.reported) {
        report(state.active);
        state.active.reported = true;
        persist();
      }
      return;
    }

    state.active = { roundId: telemetry.roundId || randomUUID(), kind, courseId, startedAt: observedAt, reported: false,
      lastSeenAt: new Date(now()).toISOString() };
    persist();
    // Practice is reported only after it closes because open reports are course-only.
    if (kind === "course") {
      report(state.active);
      state.active.reported = true;
      persist();
    }
  }

  return {
    observe,
    completeHoleRound,
    pendingHoleRounds: () => (state.holePending ?? []).map((item) => ({ ...item })),
    getActive: () => state.active ? { ...state.active } : null
  };
}

module.exports = { createRoundLedger, loadJsonState, writeJsonState };
