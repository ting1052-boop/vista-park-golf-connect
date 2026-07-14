import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import { closeSingleSession } from "@/lib/session-cleanup";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type EndSessionBody = {
  accessSessionId?: unknown;
  bayId?: unknown;
};

type ActiveSessionRow = {
  id: string;
  store_id: string;
  reservation_id: string | null;
  bay_id: string | null;
  ends_at: string | null;
};

async function findSessionByBayId(supabase: ReturnType<typeof createSupabaseAdminClient>, bayId: string) {
  const { data, error } = await supabase
    .from("access_sessions")
    .select("id, store_id, reservation_id, bay_id, ends_at")
    .eq("bay_id", bayId)
    .in("status", ["active", "extended", "overdue"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as ActiveSessionRow | null) ?? null;
}

async function findSessionById(supabase: ReturnType<typeof createSupabaseAdminClient>, accessSessionId: string) {
  const { data, error } = await supabase
    .from("access_sessions")
    .select("id, store_id, reservation_id, bay_id, ends_at")
    .eq("id", accessSessionId)
    .in("status", ["active", "extended", "overdue"])
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as ActiveSessionRow | null) ?? null;
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminUser();
  } catch {
    return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  let body: EndSessionBody;
  try {
    body = (await request.json()) as EndSessionBody;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON 요청 본문을 확인해주세요." }, { status: 400 });
  }

  const accessSessionId = typeof body.accessSessionId === "string" ? body.accessSessionId : null;
  const bayId = typeof body.bayId === "string" ? body.bayId : null;

  if (!accessSessionId && !bayId) {
    return NextResponse.json({ ok: false, message: "종료할 세션 또는 타석을 선택해주세요." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const session = accessSessionId ? await findSessionById(supabase, accessSessionId) : await findSessionByBayId(supabase, bayId!);

    if (!session) {
      return NextResponse.json({ ok: false, message: "현재 이용 중인 세션을 찾지 못했습니다." }, { status: 404 });
    }

    const result = await closeSingleSession(supabase, session);

    return NextResponse.json({
      ok: result.status === "completed",
      bayId: result.bayId,
      accessSessionId: result.accessSessionId,
      automationStatus: result.automationStatus,
      message: result.message ?? "이용 종료 처리가 완료되었습니다."
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "이용 종료 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
