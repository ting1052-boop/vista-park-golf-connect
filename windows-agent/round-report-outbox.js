/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");

function createRoundReportOutbox({ filePath, bayCode, maxPending = 100 }) {
  let state = { version: 1, bayCode, pending: [] };
  let corrupt = false;
  if (fs.existsSync(filePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (parsed?.version === 1 && parsed?.bayCode === bayCode && Array.isArray(parsed.pending)) state = parsed;
      else corrupt = true;
    } catch { corrupt = true; }
  }

  function persist() {
    if (corrupt) throw new Error("round_report_outbox_corrupt");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temp = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(state, null, 2), "utf8");
    fs.renameSync(temp, filePath);
  }

  function enqueue(report) {
    const index = state.pending.findIndex((item) => item.roundId === report.roundId);
    if (index >= 0 && state.pending[index].revision >= report.revision) return false;
    if (index >= 0) state.pending[index] = report;
    else {
      if (state.pending.length >= maxPending) throw new Error("round_report_outbox_full");
      state.pending.push(report);
    }
    persist();
    return true;
  }

  function list(limit = 10) {
    return state.pending.slice(0, Math.min(10, Math.max(0, limit))).map((report) => ({ ...report }));
  }

  function applyServerResult(acks = [], rejected = []) {
    const acknowledged = new Map(acks.map((item) => [item?.roundId, Number(item?.revision)]));
    const permanent = new Map(rejected.filter((item) => item?.roundId && item.code !== "storage_unavailable")
      .map((item) => [item.roundId, Number(item.revision)]));
    const next = state.pending.filter((report) =>
      (acknowledged.get(report.roundId) ?? -1) < report.revision &&
      (permanent.get(report.roundId) ?? -1) < report.revision);
    if (next.length === state.pending.length) return;
    state.pending = next;
    persist();
  }

  return { enqueue, list, applyServerResult };
}

module.exports = { createRoundReportOutbox };
