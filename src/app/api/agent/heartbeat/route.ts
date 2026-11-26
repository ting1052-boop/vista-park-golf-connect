import { NextRequest, NextResponse } from "next/server";
import { getAgentByToken, storeAgentGameTelemetry, touchAgent } from "@/lib/agent-server";
import { normalizeAgentRoundEvents, storeAgentRoundEvents } from "@/lib/agent-round-events";
import { normalizeAgentUsageEvents, storeAgentUsageEvents } from "@/lib/agent-usage-events";
import { normalizeGameTelemetry } from "@/lib/game-telemetry";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { claimShutdownCommand } from "@/lib/agent-commands";
import { getAgentObserverPolicy } from "@/lib/agent-observer-protocol";
import { normalizeAgentRoundReports, rawRoundReportKey, storeAgentRoundReports } from "@/lib/agent-round-reports";

type HeartbeatBody = {
  agentId?: unknown;
  storeId?: unknown;
  bayId?: unknown;
  bayCode?: unknown;
  pcName?: unknown;
  agentVersion?: unknown;
  status?: unknown;
  accessSessionId?: unknown;
  remainingSeconds?: unknown;
  gameAppRunning?: unknown;
  screenLocked?: unknown;
  lastSeenAt?: unknown;
  gameTelemetry?: unknown;
  roundEvents?: unknown;
  usageEvents?: unknown;
  observerProtocol?: unknown;
  roundReports?: unknown;
};

const MAX_HEARTBEAT_BYTES = 32 * 1024;
const MAX_TELEMETRY_BYTES = 8 * 1024;

export async function POST(request: NextRequest) {
  const supabase = createSupabaseAdminClient();
  const { agent, error: authError } = await getAgentByToken(supabase, request);

  if (!agent) {
    return NextResponse.json({ ok: false, message: authError ?? "Agent heartbeat 인증에 실패했습니다." }, { status: 401 });
  }

  let body: HeartbeatBody;
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_HEARTBEAT_BYTES) {
      return NextResponse.json({ ok: false, message: "Heartbeat 요청이 너무 큽니다." }, { status: 413 });
    }
    body = JSON.parse(rawBody) as HeartbeatBody;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON 요청 본문을 확인해주세요." }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const pcName = typeof body.pcName === "string" ? body.pcName : null;
  const agentVersion = typeof body.agentVersion === "string" ? body.agentVersion : null;

  await touchAgent(supabase, agent, { pcName, agentVersion });
  const observerPolicy = await getAgentObserverPolicy(supabase, agent, body.observerProtocol);

  let gameTelemetryAccepted: boolean | null = null;
  if (body.gameTelemetry !== undefined) {
    const telemetrySize = Buffer.byteLength(JSON.stringify(body.gameTelemetry), "utf8");
    const telemetry = telemetrySize <= MAX_TELEMETRY_BYTES ? normalizeGameTelemetry(body.gameTelemetry) : null;
    if (telemetry) {
      try {
        const result = await storeAgentGameTelemetry(supabase, agent, telemetry);
        gameTelemetryAccepted = result.stored || result.reason === "older_sample";
      } catch (error) {
        // Game monitoring is optional. A missing migration or telemetry storage
        // failure must not interrupt the session heartbeat or time controls.
        console.warn("Agent game telemetry was not stored", {
          agentId: agent.id,
          error: error instanceof Error ? error.message : "unknown"
        });
        gameTelemetryAccepted = false;
      }
    } else {
      gameTelemetryAccepted = false;
    }
  }

  const roundEventAckIds: string[] = [];
  let roundEventRejected: Array<{ eventId: string | null; code: string }> = [];
  let roundEventRetryable = false;
  if (body.roundEvents !== undefined) {
    const normalizedEvents = normalizeAgentRoundEvents(body.roundEvents);
    if (!normalizedEvents) {
      roundEventRejected = [{ eventId: null, code: "invalid_batch" }];
    } else {
      const validEvents = normalizedEvents.filter((event): event is NonNullable<typeof event> => event !== null);
      roundEventRejected = normalizedEvents
        .map((event, index) => event ? null : { eventId: null, code: `invalid_event_${index}` })
        .filter((event): event is { eventId: null; code: string } => event !== null);
      if (validEvents.length > 0) {
        try {
          const stored = await storeAgentRoundEvents(supabase, agent, validEvents);
          roundEventAckIds.push(...stored.acknowledgedIds);
          roundEventRejected.push(...stored.rejected);
          roundEventRetryable = stored.retryable;
        } catch (error) {
          console.warn("Agent round events were not stored", {
            agentId: agent.id,
            error: error instanceof Error ? error.message : "unknown"
          });
          roundEventRetryable = true;
        }
      }
    }
  }

  const usageEventAckIds: string[] = [];
  let usageEventRejected: Array<{ eventId: string | null; code: string }> = [];
  let usageEventRetryable = false;
  if (body.usageEvents !== undefined) {
    const normalizedEvents = normalizeAgentUsageEvents(body.usageEvents);
    if (!normalizedEvents) {
      usageEventRejected = [{ eventId: null, code: "invalid_batch" }];
    } else {
      const validEvents = normalizedEvents.filter((event): event is NonNullable<typeof event> => event !== null);
      usageEventRejected = normalizedEvents
        .map((event, index) => event ? null : { eventId: null, code: `invalid_event_${index}` })
        .filter((event): event is { eventId: null; code: string } => event !== null);
      if (validEvents.length > 0) {
        try {
          const stored = await storeAgentUsageEvents(supabase, agent, validEvents);
          usageEventAckIds.push(...stored.acknowledgedIds);
          usageEventRejected.push(...stored.rejected);
          usageEventRetryable = stored.retryable;
        } catch (error) {
          console.warn("Agent usage events were not stored", { agentId: agent.id, error: error instanceof Error ? error.message : "unknown" });
          usageEventRetryable = true;
        }
      }
    }
  }

  const roundReportAcks: Array<{ roundId: string; revision: number }> = [];
  let roundReportRejected: Array<{ roundId: string | null; revision: number | null; code: string }> = [];
  let roundReportRetryable = false;
  if (body.roundReports !== undefined) {
    const normalized = normalizeAgentRoundReports(body.roundReports);
    if (!normalized) {
      roundReportRejected = [{ roundId: null, revision: null, code: "invalid_batch" }];
    } else {
      const valid = normalized.filter((report): report is NonNullable<typeof report> => report !== null);
      const rawReports = body.roundReports as unknown[];
      // roundId·revision 을 돌려줘야 Agent 가 고칠 수 없는 보고(7일 초과·31일 지남 등)를 outbox 에서 지운다.
      roundReportRejected = normalized.flatMap((report, index) => report ? [] : [{ ...rawRoundReportKey(rawReports[index]), code: `invalid_report_${index}` }]);
      if (valid.length > 0) {
        try {
          const stored = await storeAgentRoundReports(supabase, agent, valid);
          roundReportAcks.push(...stored.acknowledgements);
          roundReportRejected.push(...stored.rejected);
          roundReportRetryable = stored.retryable;
        } catch (error) {
          console.warn("Agent round reports were not stored", { agentId: agent.id, error: error instanceof Error ? error.message : "unknown" });
          roundReportRetryable = true;
        }
      }
    }
  }

  if (!observerPolicy && typeof body.accessSessionId === "string" && typeof body.remainingSeconds === "number") {
    const { data: matchingSession } = await supabase
      .from("access_sessions")
      .select("id")
      .eq("id", body.accessSessionId)
      .eq("store_id", agent.store_id)
      .eq("bay_id", agent.bay_id)
      .maybeSingle();
    if (matchingSession) {
      await supabase
        .from("kiosk_sessions")
        .update({
          remaining_seconds: Math.max(0, Math.floor(body.remainingSeconds)),
          is_locked: body.screenLocked === true,
          locked_at: body.screenLocked === true ? nowIso : null
        })
        .eq("access_session_id", body.accessSessionId);
    }
  }

  const response = {
    ok: true,
    receivedAt: nowIso,
    status: typeof body.status === "string" ? body.status : "unknown",
    gameTelemetryAccepted,
    acceptedGameTelemetrySchemaVersions: [1, 2],
    roundEventAckIds,
    roundEventRejected,
    roundEventRetryable,
    usageEventAckIds,
    usageEventRejected,
    usageEventRetryable,
    roundReportAcks,
    roundReportRejected,
    roundReportRetryable
  };

  if (observerPolicy) {
    try {
      const commands = await claimShutdownCommand(supabase, agent);
      return NextResponse.json({ ...response, commands, observerPolicy });
    } catch (error) {
      // Preserve persisted outbox ACKs even when command delivery must retry.
      return NextResponse.json({
        ...response,
        ok: false,
        commands: [],
        observerPolicy,
        message: error instanceof Error ? error.message : "Agent 명령을 확인하지 못했습니다."
      }, { status: 500 });
    }
  }

  return NextResponse.json(response);
}
