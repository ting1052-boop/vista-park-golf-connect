import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentDevice } from "@/lib/agent-server";

export type AgentUsageEvent = {
  eventId: string;
  usageId: string;
  eventType: "usage_started" | "usage_ended";
  source: "foreground_input" | "park_log";
  confidence: "unknown" | "low" | "medium" | "high";
  occurredAt: string;
  startedAt: string;
  endsAt: string;
  endReason: "duration_elapsed" | "process_exit" | null;
  agentVersion: string;
};

export type UsageEventResult = {
  acknowledgedIds: string[];
  rejected: Array<{ eventId: string | null; code: string }>;
  retryable: boolean;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_EVENT_AGE_MS = 31 * 24 * 60 * 60_000;
const MAX_FUTURE_SKEW_MS = 5 * 60_000;

function text(value: unknown, max: number) {
  return typeof value === "string" && value.length > 0 && value.length <= max ? value : null;
}

function iso(value: unknown, now: Date) {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || parsed > now.getTime() + MAX_FUTURE_SKEW_MS) return null;
  return new Date(parsed).toISOString();
}

export function normalizeAgentUsageEvent(value: unknown, now = new Date()): AgentUsageEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const eventId = text(raw.eventId, 80);
  const usageId = text(raw.usageId, 80);
  const occurredAt = iso(raw.occurredAt, now);
  const startedAt = iso(raw.startedAt, now);
  const endsAt = iso(raw.endsAt, now);
  const agentVersion = text(raw.agentVersion, 40);
  const confidence = raw.confidence === "low" || raw.confidence === "medium" || raw.confidence === "high" || raw.confidence === "unknown"
    ? raw.confidence : null;
  const endReason = raw.endReason === null || raw.endReason === undefined || raw.endReason === ""
    ? null : raw.endReason === "duration_elapsed" || raw.endReason === "process_exit" ? raw.endReason : undefined;
  if (
    !eventId || !usageId || !UUID_PATTERN.test(eventId) || !UUID_PATTERN.test(usageId) ||
    !occurredAt || !startedAt || !endsAt || !agentVersion || !confidence || endReason === undefined ||
    (raw.eventType !== "usage_started" && raw.eventType !== "usage_ended") ||
    (raw.source !== "foreground_input" && raw.source !== "park_log")
  ) return null;
  const startedMs = Date.parse(startedAt);
  const endsMs = Date.parse(endsAt);
  const occurredMs = Date.parse(occurredAt);
  if (endsMs - startedMs !== 60 * 60_000 || occurredMs < startedMs || now.getTime() - occurredMs > MAX_EVENT_AGE_MS) return null;
  if (raw.eventType === "usage_started" && endReason !== null) return null;
  if (raw.eventType === "usage_ended" && endReason === null) return null;
  return {
    eventId, usageId, eventType: raw.eventType, source: raw.source, confidence,
    occurredAt, startedAt, endsAt, endReason, agentVersion
  };
}

export function normalizeAgentUsageEvents(value: unknown, now = new Date()) {
  if (!Array.isArray(value) || value.length > 20) return null;
  return value.map((item) => normalizeAgentUsageEvent(item, now));
}

export async function storeAgentUsageEvents(
  supabase: SupabaseClient,
  agent: AgentDevice,
  events: AgentUsageEvent[]
): Promise<UsageEventResult> {
  const result: UsageEventResult = { acknowledgedIds: [], rejected: [], retryable: false };
  for (const event of events) {
    const { error } = await supabase.from("agent_usage_events").insert({
      event_id: event.eventId,
      agent_device_id: agent.id,
      store_id: agent.store_id,
      bay_id: agent.bay_id,
      usage_id: event.usageId,
      event_type: event.eventType,
      source: event.source,
      confidence: event.confidence,
      occurred_at: event.occurredAt,
      started_at: event.startedAt,
      ends_at: event.endsAt,
      end_reason: event.endReason,
      agent_version: event.agentVersion
    });
    if (!error) {
      result.acknowledgedIds.push(event.eventId);
      continue;
    }
    if (error.code === "23505") {
      const { data, error: readError } = await supabase
        .from("agent_usage_events")
        .select("event_id")
        .eq("agent_device_id", agent.id)
        .eq("usage_id", event.usageId)
        .eq("event_type", event.eventType)
        .maybeSingle();
      if (!readError && data?.event_id) {
        result.acknowledgedIds.push(event.eventId);
        continue;
      }
    }
    result.retryable = true;
    result.rejected.push({ eventId: event.eventId, code: error.code === "23505" ? "event_conflict" : "storage_unavailable" });
  }
  return result;
}
