// 명령 대기열 정리를 "읽기 1번 → 필요한 쓰기만" 으로 바꾸기 위한 판단 로직.
// 예전에는 폴링마다 조건부 UPDATE 를 2~4번 무조건 보냈다. 대기열은 거의 항상 비어 있어
// 그 UPDATE 들이 Supabase 요청의 약 30%(2026-11-27 로그)를 차지했다.
// 실제 UPDATE 는 예전 조건을 그대로 두고 대상 id 만 좁히므로 동시 폴링에서도 안전하다.

export type QueuedCommand = {
  id: string;
  status: string;
  command_type: string;
  attempts: number;
  created_at: string;
  lease_expires_at: string | null;
};

export const QUEUED_COMMAND_COLUMNS = "id, status, command_type, attempts, created_at, lease_expires_at";

const before = (iso: string | null, ms: number) => iso !== null && Date.parse(iso) < ms;
const ids = (rows: QueuedCommand[]) => rows.map((row) => row.id);
const oldestFirst = (a: QueuedCommand, b: QueuedCommand) => Date.parse(a.created_at) - Date.parse(b.created_at);

/** Agent 종료 명령: 만료된 처리 중 → 대기 복구, 오래된 대기 → 취소, 남은 것 중 가장 오래된 것을 받는다. */
export function planShutdownClaim(rows: QueuedCommand[], now: number, maxAgeMs: number) {
  const recover = rows.filter((row) => row.status === "processing" && before(row.lease_expires_at, now));
  const pending = [...rows.filter((row) => row.status === "pending"), ...recover];
  const cancel = pending.filter((row) => before(row.created_at, now - maxAgeMs));
  const next = pending.filter((row) => !cancel.includes(row)).sort(oldestFirst)[0] ?? null;
  return { recoverIds: ids(recover), cancelIds: ids(cancel), next };
}

/** 매장 제어기 명령: 예전 4단계(오래된 대기 취소, 끊긴 처리 취소, 재시도 초과, 만료 복구)와 같은 결과. */
export function planControllerPoll(
  rows: QueuedCommand[],
  now: number,
  options: { types: readonly string[]; maxAgeMs: number; maxAttempts: number; limit: number }
) {
  const staleBefore = now - options.maxAgeMs;
  const own = (row: QueuedCommand) => options.types.includes(row.command_type);

  const cancelPending = rows.filter((row) => own(row) && row.status === "pending" && before(row.created_at, staleBefore));
  const cancelProcessing = rows.filter(
    (row) => own(row) && row.status === "processing" && before(row.lease_expires_at, now) && before(row.created_at, staleBefore)
  );
  const exhausted = rows.filter(
    (row) => own(row) && row.status === "pending" && row.attempts >= options.maxAttempts && !cancelPending.includes(row)
  );
  // 복구는 예전처럼 명령 종류를 가리지 않는다(Agent 종료 명령도 여기서 풀린다).
  const recover = rows.filter(
    (row) => row.status === "processing" && before(row.lease_expires_at, now) && !cancelProcessing.includes(row)
  );

  const candidates = [...rows.filter((row) => row.status === "pending"), ...recover]
    .filter((row) => own(row) && !cancelPending.includes(row) && !exhausted.includes(row))
    .filter((row) => !before(row.created_at, staleBefore) && row.attempts < options.maxAttempts)
    .sort(oldestFirst)
    .slice(0, options.limit);

  return {
    cancelPendingIds: ids(cancelPending),
    cancelProcessingIds: ids(cancelProcessing),
    exhaustedIds: ids(exhausted),
    recoverIds: ids(recover),
    candidates
  };
}

export const AGENT_TOUCH_INTERVAL_MS = 30_000;

/**
 * last_seen_at 을 폴링마다(3초) 쓰지 않고 30초에 한 번만 쓴다. 온라인 판정은 120초 기준이라 여유가 있다.
 * 버전이나 PC 이름이 바뀌면 바로 쓴다.
 */
export function needsAgentTouch(
  current: { last_seen_at?: string | null; agent_version?: string | null; pc_name?: string | null },
  next: { agentVersion?: string | null; pcName?: string | null },
  now: number
) {
  const lastSeen = Date.parse(current.last_seen_at ?? "");
  if (!Number.isFinite(lastSeen) || now - lastSeen >= AGENT_TOUCH_INTERVAL_MS || lastSeen > now + 5_000) return true;
  if (next.agentVersion && next.agentVersion !== current.agent_version) return true;
  if (next.pcName && next.pcName !== current.pc_name) return true;
  return false;
}
