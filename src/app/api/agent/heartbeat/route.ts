import { NextRequest, NextResponse } from "next/server";
import { getAgentByToken, storeAgentGameTelemetry, touchAgent } from "@/lib/agent-server";
import { normalizeAgentRoundEvents, storeAgentRoundEvents } from "@/lib/agent-round-events";
import { normalizeGameTelemetry } from "@/lib/game-telemetry";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

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

  if (typeof body.accessSessionId === "string" && typeof body.remainingSeconds === "number") {
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

  return NextResponse.json({
    ok: true,
    receivedAt: nowIso,
    status: typeof body.status === "string" ? body.status : "unknown",
    gameTelemetryAccepted,
    acceptedGameTelemetrySchemaVersions: [1, 2],
    roundEventAckIds,
    roundEventRejected,
    roundEventRetryable
  });
}
