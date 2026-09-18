import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentDevice } from "@/lib/agent-server";

export type AgentRoundEvent = {
  eventId: string;
  roundId: string;
  eventType: "returned_to_lobby";
  courseId: string | null;
  occurredAt: string;
  completionKind: "unverified";
  lastKnownHole: number | null;
  lastKnownHoleAt: string | null;
  source: "log";
  agentVersion: string;
};

export type RoundEventResult = {
  acknowledgedIds: string[];
  rejected: Array<{ eventId: string | null; code: string }>;
  retryable: boolean;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_EVENT_AGE_MS = 31 * 24 * 60 * 60_000;
const MAX_FUTURE_SKEW_MS = 5 * 60_000;

function safeText(value: unknown, maxLength: number) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength ? value : null;
}

function nullableIso(value: unknown, now: Date) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined;
  const millis = Date.parse(value);
  if (!Number.isFinite(millis) || millis > now.getTime() + MAX_FUTURE_SKEW_MS) return undefined;
  return new Date(millis).toISOString();
}

export function normalizeAgentRoundEvent(value: unknown, now = new Date()): AgentRoundEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const eventId = safeText(raw.eventId, 80);
  const roundId = safeText(raw.roundId, 80);
  const courseId = raw.courseId === null || raw.courseId === undefined ? null : safeText(raw.courseId, 128);
  const occurredAt = nullableIso(raw.occurredAt, now);
  const lastKnownHoleAt = nullableIso(raw.lastKnownHoleAt, now);
  const agentVersion = safeText(raw.agentVersion, 40);
  const lastKnownHole =
    raw.lastKnownHole === null || raw.lastKnownHole === undefined
      ? null
      : Number.isSafeInteger(raw.lastKnownHole) && Number(raw.lastKnownHole) >= 1 && Number(raw.lastKnownHole) <= 18
        ? Number(raw.lastKnownHole)
        : undefined;

  if (
    !eventId || !roundId || !UUID_PATTERN.test(eventId) || !UUID_PATTERN.test(roundId) ||
    courseId === undefined || !occurredAt || lastKnownHoleAt === undefined || lastKnownHole === undefined ||
    !agentVersion || raw.eventType !== "returned_to_lobby" || raw.completionKind !== "unverified" || raw.source !== "log"
  ) return null;

  const occurredMs = Date.parse(occurredAt);
  if (now.getTime() - occurredMs > MAX_EVENT_AGE_MS) return null;

  return {
    eventId,
    roundId,
    eventType: "returned_to_lobby",
    courseId,
    occurredAt,
    completionKind: "unverified",
    lastKnownHole,
    lastKnownHoleAt,
    source: "log",
    agentVersion
  };
}

export function normalizeAgentRoundEvents(value: unknown, now = new Date()) {
  if (!Array.isArray(value) || value.length > 20) return null;
  return value.map((event) => normalizeAgentRoundEvent(event, now));
}

async function acknowledgeExistingEvent(
  supabase: SupabaseClient,
  agent: AgentDevice,
  event: AgentRoundEvent
) {
  const { data, error } = await supabase
    .from("agent_round_events")
    .select("event_id, round_id, event_type")
    .eq("agent_device_id", agent.id)
    .eq("round_id", event.roundId)
    .eq("event_type", event.eventType)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.event_id === event.eventId || data?.round_id === event.roundId;
}

export async function storeAgentRoundEvents(
  supabase: SupabaseClient,
  agent: AgentDevice,
  events: AgentRoundEvent[]
): Promise<RoundEventResult> {
  const result: RoundEventResult = { acknowledgedIds: [], rejected: [], retryable: false };

  for (const event of events) {
    const { error } = await supabase.from("agent_round_events").insert({
      event_id: event.eventId,
      agent_device_id: agent.id,
      store_id: agent.store_id,
      bay_id: agent.bay_id,
      round_id: event.roundId,
      event_type: event.eventType,
      course_id: event.courseId,
      occurred_at: event.occurredAt,
      last_known_hole: event.lastKnownHole,
      last_known_hole_at: event.lastKnownHoleAt,
      completion_kind: event.completionKind,
      source: event.source,
      agent_version: event.agentVersion
    });

    if (!error) {
      result.acknowledgedIds.push(event.eventId);
      continue;
    }
    if (error.code === "23505" && await acknowledgeExistingEvent(supabase, agent, event)) {
      result.acknowledgedIds.push(event.eventId);
      continue;
    }

    result.retryable = true;
    result.rejected.push({ eventId: event.eventId, code: error.code === "23505" ? "event_conflict" : "storage_unavailable" });
  }

  return result;
}
