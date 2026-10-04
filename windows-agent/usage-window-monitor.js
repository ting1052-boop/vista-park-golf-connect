/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const SOURCES = new Set(["foreground_input", "park_log"]);
const CONFIDENCE = new Set(["low", "medium", "high"]);

function createUsageWindowMonitor(options) {
  const filePath = options.filePath || null;
  const bayCode = String(options.bayCode || "");
  const durationMs = Math.max(60_000, Number(options.durationMs || 60 * 60_000));
  const now = options.now || Date.now;
  const createId = options.createId || randomUUID;
  const agentVersion = String(options.agentVersion || "unknown");
  const maxPending = Math.max(20, Number(options.maxPending || 500));
  let state = { version: 1, bayCode, active: null, pending: [], rejected: [] };
  let loadFailed = false;

  function load() {
    if (!filePath || !fs.existsSync(filePath)) return;
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (parsed?.version !== 1 || parsed?.bayCode !== bayCode || !Array.isArray(parsed.pending)) return;
      state = {
        version: 1,
        bayCode,
        active: parsed.active && typeof parsed.active === "object" ? parsed.active : null,
        pending: parsed.pending.slice(-maxPending),
        rejected: Array.isArray(parsed.rejected) ? parsed.rejected.slice(-100) : []
      };
    } catch {
      loadFailed = true;
    }
  }

  function persist() {
    if (!filePath) return;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), "utf8");
    fs.renameSync(tempPath, filePath);
  }

  function enqueue(event) {
    if (state.pending.some((item) => item.eventId === event.eventId)) return;
    if (state.pending.length >= maxPending) throw new Error("usage_event_outbox_full");
    state.pending.push(event);
  }

  function eventBase(active, eventType, occurredAt) {
    return {
      eventId: createId(),
      usageId: active.usageId,
      eventType,
      source: active.source,
      confidence: active.confidence,
      occurredAt,
      startedAt: active.startedAt,
      endsAt: active.endsAt,
      agentVersion
    };
  }

  function endActive(reason, occurredAt) {
    if (!state.active) return false;
    enqueue({ ...eventBase(state.active, "usage_ended", occurredAt), endReason: reason });
    state.active = null;
    return true;
  }

  function startActive(source, confidence, occurredAt, lastInputAt) {
    if (!SOURCES.has(source) || !CONFIDENCE.has(confidence)) return false;
    const startedMs = Date.parse(occurredAt);
    if (!Number.isFinite(startedMs)) return false;
    const active = {
      usageId: createId(),
      source,
      confidence,
      startedAt: new Date(startedMs).toISOString(),
      endsAt: new Date(startedMs + durationMs).toISOString(),
      lastInputAt: source === "foreground_input" ? lastInputAt || occurredAt : null
    };
    state.active = active;
    enqueue({ ...eventBase(active, "usage_started", active.startedAt), endReason: null });
    return true;
  }

  function snapshot(observedAt, healthy, gameRunning) {
    if (!healthy || gameRunning === null) {
      return {
        state: "unknown",
        usageId: state.active?.usageId ?? null,
        source: state.active?.source ?? "foreground_input",
        confidence: "unknown",
        startedAt: state.active?.startedAt ?? null,
        endsAt: state.active?.endsAt ?? null,
        observedAt,
        lastInputAt: state.active?.lastInputAt ?? null
      };
    }
    if (!state.active) {
      return {
        state: "awaiting_input",
        usageId: null,
        source: "foreground_input",
        confidence: "unknown",
        startedAt: null,
        endsAt: null,
        observedAt,
        lastInputAt: null
      };
    }
    return { state: "active", ...state.active, observedAt };
  }

  function observe(args) {
    const observedMs = Number.isFinite(args.observedMs) ? args.observedMs : now();
    const observedAt = new Date(observedMs).toISOString();
    if (loadFailed) return snapshot(observedAt, false, args.gameRunning ?? null);

    let changed = false;
    if (state.active && observedMs >= Date.parse(state.active.endsAt)) {
      changed = endActive("duration_elapsed", state.active.endsAt) || changed;
    }
    if (args.gameRunning === false) {
      changed = endActive("process_exit", observedAt) || changed;
    } else if (args.trigger === true && !state.active) {
      changed = startActive(
        args.source,
        args.confidence,
        observedAt,
        args.lastInputAt ? new Date(args.lastInputAt).toISOString() : null
      ) || changed;
    } else if (state.active && args.source === "foreground_input" && args.lastInputAt) {
      const inputIso = new Date(args.lastInputAt).toISOString();
      if (state.active.lastInputAt !== inputIso) {
        state.active.lastInputAt = inputIso;
        changed = true;
      }
    }

    if (changed) persist();
    return snapshot(observedAt, args.healthy !== false, args.gameRunning ?? null);
  }

  function listEvents(limit = 20) {
    return state.pending.slice(0, Math.max(0, Math.min(20, limit))).map((event) => ({ ...event }));
  }

  function applyServerResult(ackIds = [], rejected = []) {
    if (loadFailed) return;
    const acknowledged = new Set(ackIds);
    const permanent = new Set(
      rejected
        .filter((item) => item?.eventId && item.code !== "storage_unavailable")
        .map((item) => item.eventId)
    );
    const rejectedEvents = state.pending.filter((event) => permanent.has(event.eventId));
    const nextPending = state.pending.filter(
      (event) => !acknowledged.has(event.eventId) && !permanent.has(event.eventId)
    );
    if (nextPending.length === state.pending.length) return;
    state.pending = nextPending;
    state.rejected.push(...rejectedEvents.map((event) => ({ event, rejectedAt: new Date(now()).toISOString() })));
    state.rejected = state.rejected.slice(-100);
    persist();
  }

  load();
  return { observe, listEvents, applyServerResult, pendingCount: () => state.pending.length };
}

module.exports = { createUsageWindowMonitor };
