/* eslint-disable @typescript-eslint/no-require-imports */
const { loadJsonState, writeJsonState } = require("./round-ledger");

function createRoundReportOutbox({ filePath, bayCode, maxPending = 100 }) {
  // 읽을 수 없거나 다른 타석의 파일이면 옆으로 치우고 새로 시작한다(영구 정지보다 낫다).
  const state = loadJsonState(filePath, (parsed) =>
    parsed?.version === 1 && parsed?.bayCode === bayCode && Array.isArray(parsed.pending)) ?? { version: 1, bayCode, pending: [] };

  function persist() {
    writeJsonState(filePath, state);
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
