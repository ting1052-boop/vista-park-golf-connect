/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("node:fs/promises");

function parseScreenGolfEvents(text) {
  const events = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (/Game class is 'SGGameModeBase_C'|Browse:\s*\/Game\/Golf\/Course\//iu.test(line)) {
      events.push("round_entered");
    }
    if (/Game class is 'BP_LobbyModebase_C'|Browse:\s*.*\/UIMap(?:\?|\s|$)/iu.test(line)) {
      events.push("lobby_entered");
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

  function applyEvents(events) {
    for (const event of events) {
      if (event === "round_entered") {
        state = {
          gameState: "playing",
          currentHole: null,
          roundStatus: "in_progress",
          stateSource: "mixed",
          confidence: "high",
          reasonCode: null
        };
      } else if (event === "lobby_entered") {
        const leftActiveRound = state?.roundStatus === "in_progress";
        state = {
          gameState: "menu",
          currentHole: null,
          roundStatus: leftActiveRound ? "unknown" : "not_started",
          stateSource: "mixed",
          confidence: "high",
          reasonCode: leftActiveRound ? "round_exit_unclassified" : null
        };
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
        start = Math.max(0, stat.size - maxReadBytes);
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
