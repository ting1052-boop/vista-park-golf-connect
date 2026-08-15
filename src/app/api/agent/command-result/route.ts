import { NextRequest, NextResponse } from "next/server";
import { getAgentByToken } from "@/lib/agent-server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type ResultBody = {
  commandId?: unknown;
  ok?: unknown;
  error?: unknown;
};

export async function POST(request: NextRequest) {
  const supabase = createSupabaseAdminClient();
  const { agent, error: authError } = await getAgentByToken(supabase, request);

  if (!agent) {
    return NextResponse.json({ ok: false, message: authError ?? "Agent 인증에 실패했습니다." }, { status: 401 });
  }

  let body: ResultBody;
  try {
    body = (await request.json()) as ResultBody;
  } catch {
    return NextResponse.json({ ok: false, message: "명령 결과 형식을 읽지 못했습니다." }, { status: 400 });
  }

  if (typeof body.commandId !== "string" || typeof body.ok !== "boolean") {
    return NextResponse.json({ ok: false, message: "명령 ID 또는 실행 결과가 올바르지 않습니다." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("store_controller_commands")
    .update({
      status: body.ok ? "succeeded" : "failed",
      completed_at: new Date().toISOString(),
      lease_expires_at: null,
      response_payload: { agentId: agent.id, accepted: body.ok },
      error_message: typeof body.error === "string" ? body.error.slice(0, 1000) : null
    })
    .eq("id", body.commandId)
    .eq("bay_id", agent.bay_id)
    .eq("command_type", "shutdown_pc")
    .eq("status", "processing")
    .eq("controller_id", `agent:${agent.id}`)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, message: "처리 중인 종료 명령을 찾지 못했습니다." }, { status: 409 });

  return NextResponse.json({ ok: true });
}
