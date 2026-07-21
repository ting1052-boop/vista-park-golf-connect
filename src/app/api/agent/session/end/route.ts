import { NextRequest, NextResponse } from "next/server";
import { getAgentByToken, touchAgent } from "@/lib/agent-server";
import { closeSingleSession } from "@/lib/session-cleanup";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type EndSessionBody = {
  accessSessionId?: unknown;
};

type ExpiredSessionRow = {
  id: string;
  store_id: string;
  reservation_id: string | null;
  bay_id: string | null;
  ends_at: string | null;
};

export async function POST(request: NextRequest) {
  const supabase = createSupabaseAdminClient();
  const { agent, error: authError } = await getAgentByToken(supabase, request);

  if (!agent) {
    return NextResponse.json({ ok: false, message: authError ?? "Agent 인증에 실패했습니다." }, { status: 401 });
  }

  let body: EndSessionBody;
  try {
    body = (await request.json()) as EndSessionBody;
  } catch {
    return NextResponse.json({ ok: false, message: "요청 내용을 확인해주세요." }, { status: 400 });
  }

  const accessSessionId = typeof body.accessSessionId === "string" ? body.accessSessionId : null;
  if (!accessSessionId) {
    return NextResponse.json({ ok: false, message: "종료할 이용 세션이 필요합니다." }, { status: 400 });
  }

  await touchAgent(supabase, agent);

  const { data, error } = await supabase
    .from("access_sessions")
    .select("id, store_id, reservation_id, bay_id, ends_at")
    .eq("id", accessSessionId)
    .eq("bay_id", agent.bay_id)
    .in("status", ["active", "extended", "overdue"])
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ ok: true, status: "already_completed" });
  }

  const session = data as ExpiredSessionRow;
  if (!session.ends_at || new Date(session.ends_at).getTime() > Date.now()) {
    return NextResponse.json({ ok: false, message: "아직 종료 시간이 되지 않았습니다." }, { status: 409 });
  }

  try {
    const result = await closeSingleSession(supabase, session, undefined, { runAutomation: false });
    return NextResponse.json({
      ok: result.status === "completed" || result.status === "not_found",
      status: result.status,
      automationStatus: result.automationStatus
    });
  } catch (caughtError) {
    return NextResponse.json(
      { ok: false, message: caughtError instanceof Error ? caughtError.message : "이용 종료 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
