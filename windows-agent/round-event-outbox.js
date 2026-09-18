/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");

function createRoundEventOutbox(options) {
  const filePath = options.filePath;
  const bayCode = options.bayCode;
  const maxPending = Math.max(20, Number(options.maxPending ?? 500));
  let state = { version: 1, bayCode, pending: [], rejected: [] };
  let loadFailed = false;

  function load() {
    if (!fs.existsSync(filePath)) return;
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (parsed?.version === 1 && parsed?.bayCode === bayCode && Array.isArray(parsed.pending)) {
        state = { version: 1, bayCode, pending: parsed.pending.slice(-maxPending), rejected: Array.isArray(parsed.rejected) ? parsed.rejected.slice(-100) : [] };
      }
    } catch {
      // A corrupt outbox is never silently overwritten.
      loadFailed = true;
    }
  }

  function persist() {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), "utf8");
    fs.renameSync(tempPath, filePath);
  }

  function enqueue(event) {
    if (loadFailed) throw new Error("round_event_outbox_corrupt");
    if (!event?.eventId || state.pending.some((item) => item.eventId === event.eventId)) return false;
    if (state.pending.length >= maxPending) throw new Error("round_event_outbox_full");
    const next = { ...event };
    state.pending.push(next);
    try {
      persist();
      return true;
    } catch (error) {
      state.pending = state.pending.filter((item) => item.eventId !== event.eventId);
      throw error;
    }
  }

  function list(limit = 20) {
    return state.pending.slice(0, Math.max(0, Math.min(20, limit))).map((event) => ({ ...event }));
  }

  function applyServerResult(ackIds = [], rejected = []) {
    const ack = new Set(ackIds);
    const permanent = new Set(rejected.filter((item) => item?.eventId && item.code !== "storage_unavailable").map((item) => item.eventId));
    const rejectedEvents = state.pending.filter((event) => permanent.has(event.eventId));
    const nextPending = state.pending.filter((event) => !ack.has(event.eventId) && !permanent.has(event.eventId));
    if (nextPending.length === state.pending.length) return;
    state.pending = nextPending;
    state.rejected.push(...rejectedEvents.map((event) => ({ event, rejectedAt: new Date().toISOString() })));
    state.rejected = state.rejected.slice(-100);
    persist();
  }

  load();
  return { enqueue, list, applyServerResult, pendingCount: () => state.pending.length };
}

module.exports = { createRoundEventOutbox };
