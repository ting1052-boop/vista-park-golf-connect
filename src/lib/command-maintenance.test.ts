import assert from "node:assert/strict";
import test from "node:test";
import { needsAgentTouch, planControllerPoll, planShutdownClaim, type QueuedCommand } from "./command-maintenance.ts";

const NOW = Date.parse("2026-11-27T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const row = (id: string, over: Partial<QueuedCommand> = {}): QueuedCommand => ({
  id, status: "pending", command_type: "shutdown_pc", attempts: 0, created_at: ago(10_000), lease_expires_at: null, ...over
});

test("빈 대기열이면 아무것도 쓰지 않는다", () => {
  assert.deepEqual(planShutdownClaim([], NOW, 300_000), { recoverIds: [], cancelIds: [], next: null });
  const plan = planControllerPoll([], NOW, { types: ["prepare_bay"], maxAgeMs: 900_000, maxAttempts: 20, limit: 5 });
  assert.deepEqual([plan.cancelPendingIds, plan.cancelProcessingIds, plan.exhaustedIds, plan.recoverIds, plan.candidates], [[], [], [], [], []]);
});

test("Agent 종료 명령: 만료 리스 복구, 5분 지난 대기 취소, 남은 것 중 가장 오래된 것을 받는다", () => {
  const rows = [
    row("old", { created_at: ago(400_000) }),
    row("expired", { status: "processing", created_at: ago(60_000), lease_expires_at: ago(1_000) }),
    row("live", { status: "processing", created_at: ago(90_000), lease_expires_at: new Date(NOW + 60_000).toISOString() }),
    row("fresh", { created_at: ago(30_000) })
  ];
  const plan = planShutdownClaim(rows, NOW, 300_000);
  assert.deepEqual(plan.recoverIds, ["expired"]);
  assert.deepEqual(plan.cancelIds, ["old"]);
  assert.equal(plan.next?.id, "expired");
});

test("Agent 종료 명령: 복구됐지만 5분이 지난 명령은 받지 않고 취소한다", () => {
  const plan = planShutdownClaim([row("stale", { status: "processing", created_at: ago(400_000), lease_expires_at: ago(1_000) })], NOW, 300_000);
  assert.deepEqual(plan.recoverIds, ["stale"]);
  assert.deepEqual(plan.cancelIds, ["stale"]);
  assert.equal(plan.next, null);
});

test("제어기 명령: 예전 4단계와 같은 결과", () => {
  const options = { types: ["prepare_bay", "release_bay", "run_scripts"], maxAgeMs: 900_000, maxAttempts: 20, limit: 5 };
  const rows = [
    row("stalePending", { command_type: "prepare_bay", created_at: ago(1_000_000) }),
    row("staleProcessing", { command_type: "release_bay", status: "processing", created_at: ago(1_000_000), lease_expires_at: ago(1_000) }),
    row("exhausted", { command_type: "prepare_bay", attempts: 20 }),
    row("recoverCtl", { command_type: "run_scripts", status: "processing", created_at: ago(20_000), lease_expires_at: ago(1_000) }),
    row("recoverAgent", { command_type: "shutdown_pc", status: "processing", created_at: ago(20_000), lease_expires_at: ago(1_000) }),
    row("agentPending", { command_type: "shutdown_pc" }),
    row("ready", { command_type: "prepare_bay", created_at: ago(5_000) })
  ];
  const plan = planControllerPoll(rows, NOW, options);
  assert.deepEqual(plan.cancelPendingIds, ["stalePending"]);
  assert.deepEqual(plan.cancelProcessingIds, ["staleProcessing"]);
  assert.deepEqual(plan.exhaustedIds, ["exhausted"]);
  assert.deepEqual(plan.recoverIds, ["recoverCtl", "recoverAgent"]);
  assert.deepEqual(plan.candidates.map((r) => r.id), ["recoverCtl", "ready"]);
  assert.deepEqual(planControllerPoll(rows, NOW, { ...options, limit: 1 }).candidates.map((r) => r.id), ["recoverCtl"]);
});

test("살아 있음 기록은 30초에 한 번, 버전·PC 이름이 바뀌면 바로", () => {
  const seen = { last_seen_at: ago(10_000), agent_version: "0.10.2", pc_name: "A-02" };
  assert.equal(needsAgentTouch(seen, { agentVersion: "0.10.2", pcName: "A-02" }, NOW), false);
  assert.equal(needsAgentTouch(seen, {}, NOW), false);
  assert.equal(needsAgentTouch({ ...seen, last_seen_at: ago(30_000) }, {}, NOW), true);
  assert.equal(needsAgentTouch({ ...seen, last_seen_at: null }, {}, NOW), true);
  assert.equal(needsAgentTouch(seen, { agentVersion: "0.10.3" }, NOW), true);
  assert.equal(needsAgentTouch(seen, { pcName: "A-03" }, NOW), true);
});
