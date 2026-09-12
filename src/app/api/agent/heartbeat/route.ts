import { NextRequest, NextResponse } from "next/server";
import { getAgentByToken, storeAgentGameTelemetry, touchAgent } from "@/lib/agent-server";
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
};

export async function POST(request: NextRequest) {
  const supabase = createSupabaseAdminClient();
  const { agent, error: authError } = await getAgentByToken(supabase, request);

  if (!agent) {
    return NextResponse.json({ ok: false, message: authError ?? "Agent heartbeat 인증에 실패했습니다." }, { status: 401 });
  }

  let body: HeartbeatBody;
  try {
    body = (await request.json()) as HeartbeatBody;
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
    const telemetry = telemetrySize <= 4_096 ? normalizeGameTelemetry(body.gameTelemetry) : null;
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

  if (typeof body.accessSessionId === "string" && typeof body.remainingSeconds === "number") {
    await supabase
      .from("kiosk_sessions")
      .update({
        remaining_seconds: Math.max(0, Math.floor(body.remainingSeconds)),
        is_locked: body.screenLocked === true,
        locked_at: body.screenLocked === true ? nowIso : null
      })
      .eq("access_session_id", body.accessSessionId);
  }

  return NextResponse.json({
    ok: true,
    receivedAt: nowIso,
    status: typeof body.status === "string" ? body.status : "unknown",
    gameTelemetryAccepted
  });
}
