import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentDevice } from "./agent-server.ts";
import { classifyRound, holeCounts, type RoundHoleRun } from "./round-classify.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MASK_MAX = 262143;
const DAY = 86_400_000;

export type AgentRoundReport = {
  roundId: string;
  revision: number;
  status: "open" | "closed";
  kind: "course" | "practice";
  courseId: string | null;
  startedAt: string;
  endedAt: string | null;
  timeBasis: "log" | "observed";
  endKind: "returned_to_lobby" | "course_changed" | "game_exit" | "log_ended" | null;
  holeSource: "none" | "native_log" | "ocr";
  runs: RoundHoleRun[];
  agentVersion: string;
};

function text(value: unknown, max: number) {
  return typeof value === "string" && value.length > 0 && value.length <= max ? value : null;
}

/** 거절 응답용: 원본에서 읽히는 roundId·revision. Agent outbox 는 이 둘이 있어야 영구 거절 보고를 지운다. */
export function rawRoundReportKey(raw: unknown): { roundId: string | null; revision: number | null } {
  const row = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const revision = Number(row.revision);
  return { roundId: text(row.roundId, 36), revision: Number.isInteger(revision) ? revision : null };
}

export function normalizeAgentRoundReports(value: unknown, now = Date.now()): Array<AgentRoundReport | null> | null {
  if (!Array.isArray(value) || value.length > 10) return null;
  return value.map((raw): AgentRoundReport | null => {
    if (!raw || typeof raw !== "object") return null;
    const row = raw as Record<string, unknown>;
    const roundId = text(row.roundId, 36);
    const courseId = row.courseId == null ? null : text(row.courseId, 200);
    const agentVersion = text(row.agentVersion, 40);
    const revision = Number(row.revision);
    const status = row.status === "open" || row.status === "closed" ? row.status : null;
    const kind = row.kind === "course" || row.kind === "practice" ? row.kind : null;
    const timeBasis = row.timeBasis === "log" || row.timeBasis === "observed" ? row.timeBasis : null;
    const holeSource = row.holeSource === "none" || row.holeSource === "native_log" || row.holeSource === "ocr" ? row.holeSource : null;
    const endKind = row.endKind == null ? null :
      ["returned_to_lobby", "course_changed", "game_exit", "log_ended"].includes(String(row.endKind))
        ? row.endKind as AgentRoundReport["endKind"] : null;
    const started = Date.parse(String(row.startedAt));
    const ended = row.endedAt == null ? null : Date.parse(String(row.endedAt));
    const runs = Array.isArray(row.runs) && row.runs.length <= 6 ? row.runs.map((run) => {
      if (!run || typeof run !== "object") return null;
      const enteredMask = Number((run as Record<string, unknown>).enteredMask);
      const endedMask = Number((run as Record<string, unknown>).endedMask);
      return Number.isInteger(enteredMask) && enteredMask >= 0 && enteredMask <= MASK_MAX &&
        Number.isInteger(endedMask) && endedMask >= 0 && endedMask <= MASK_MAX
        ? { enteredMask, endedMask } : null;
    }) : null;
    if (!roundId || !UUID.test(roundId) || !Number.isInteger(revision) || revision < 1 || !status || !kind ||
      !timeBasis || !holeSource || !agentVersion || !Number.isFinite(started) || started < now - 31 * DAY ||
      started > now + 5 * 60_000 || !runs || runs.some((run) => run === null)) return null;
    if (status === "open" && (kind !== "course" || row.endedAt != null || row.endKind != null || holeSource !== "none" || runs.length > 0)) return null;
    if (status === "closed" && (!Number.isFinite(ended) || !endKind || ended! < started || ended! > started + 7 * DAY || ended! > now + 5 * 60_000)) return null;
    if (kind === "practice" && (status !== "closed" || holeSource !== "none" || runs.length > 0 || ended! - started < 60_000)) return null;
    return { roundId, revision, status, kind, courseId, startedAt: new Date(started).toISOString(),
      endedAt: ended == null ? null : new Date(ended).toISOString(), timeBasis, endKind, holeSource,
      runs: runs as RoundHoleRun[], agentVersion };
  });
}

export async function storeAgentRoundReports(supabase: SupabaseClient, agent: AgentDevice, reports: AgentRoundReport[]) {
  const [storeResult, pcResult] = await Promise.all([
    supabase.from("stores").select("agent_round_counting").eq("id", agent.store_id).maybeSingle(),
    supabase.from("bay_pc_registry").select("pc_type").eq("store_id", agent.store_id).eq("bay_id", agent.bay_id).maybeSingle()
  ]);
  if (storeResult.error || pcResult.error) return { acknowledgements: [], rejected: [], retryable: true };
  if (storeResult.data?.agent_round_counting !== true || pcResult.data?.pc_type !== "park") {
    return { acknowledgements: [], rejected: reports.map((report) => ({ roundId: report.roundId, revision: report.revision, code: "profile_disabled" })), retryable: false };
  }

  const acknowledgements: Array<{ roundId: string; revision: number }> = [];
  const rejected: Array<{ roundId: string; revision: number; code: string }> = [];
  let retryable = false;
  for (const report of reports) {
    const classification = classifyRound({ status: report.status, kind: report.kind, holeSource: report.holeSource, runs: report.runs });
    const { error } = await supabase.rpc("upsert_agent_round", {
      p_agent_device_id: agent.id, p_round_id: report.roundId, p_store_id: agent.store_id, p_bay_id: agent.bay_id,
      p_revision: report.revision, p_status: report.status, p_kind: report.kind, p_course_id: report.courseId,
      p_started_at: report.startedAt, p_ended_at: report.endedAt, p_time_basis: report.timeBasis,
      p_end_kind: report.endKind, p_hole_source: report.holeSource,
      // 나중에 걸러보기용: 진행한 홀·직접 끝낸(홀아웃) 홀 수를 묶음 JSON 에 같이 저장한다(열 추가 없음).
      p_hole_runs: report.runs.map((run) => ({ ...run, ...holeCounts(run) })),
      p_counted_games: classification.countedGames, p_completion: classification.completion,
      p_agent_version: report.agentVersion
    });
    if (error) retryable = true;
    else acknowledgements.push({ roundId: report.roundId, revision: report.revision });
  }
  return { acknowledgements, rejected, retryable };
}
