/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

function createRoundLedger({ filePath, agentVersion, onReport }) {
  let state = { version: 1, active: null };
  let corrupt = false;
  if (fs.existsSync(filePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (parsed?.version === 1) state = parsed;
      else corrupt = true;
    } catch { corrupt = true; }
  }

  function persist() {
    if (corrupt) throw new Error("round_ledger_corrupt");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temp = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(state, null, 2), "utf8");
    fs.renameSync(temp, filePath);
  }

  function report(active, closed = null) {
    const value = {
      roundId: active.roundId,
      revision: closed ? 2 : 1,
      status: closed ? "closed" : "open",
      kind: active.kind,
      courseId: active.courseId,
      startedAt: active.startedAt,
      ...(closed ? { endedAt: closed.endedAt, endKind: closed.endKind } : {}),
      timeBasis: "observed",
      holeSource: "none",
      runs: [],
      agentVersion
    };
    onReport(value);
  }

  function close(endKind, observedAt) {
    if (!state.active) return;
    const active = state.active;
    const durationMs = Date.parse(observedAt) - Date.parse(active.startedAt);
    if (active.kind !== "practice" || durationMs >= 60_000) report(active, { endedAt: observedAt, endKind });
    state.active = null;
    persist();
  }

  function observe(telemetry) {
    const observedAt = telemetry?.observedAt || new Date().toISOString();
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

    state.active = { roundId: telemetry.roundId || randomUUID(), kind, courseId, startedAt: observedAt, reported: false };
    persist();
    // Practice is reported only after it closes because open reports are course-only.
    if (kind === "course") {
      report(state.active);
      state.active.reported = true;
      persist();
    }
  }

  return { observe, getActive: () => state.active ? { ...state.active } : null };
}

module.exports = { createRoundLedger };
