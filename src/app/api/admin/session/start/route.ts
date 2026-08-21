import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import { startWalkInSession } from "@/lib/kiosk";
import { ADMIN_MAX_HOURS, ADMIN_MIN_HOURS, isSupportedAdminDuration } from "@/lib/reservation-policy";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type StartSessionBody = {
  storeId?: unknown;
  bayId?: unknown;
  durationMinutes?: unknown;
  guestName?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    await requireAdminUser();
  } catch {
    return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  let body: StartSessionBody;
  try {
    body = (await request.json()) as StartSessionBody;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON 요청 본문을 확인해주세요." }, { status: 400 });
  }

  if (typeof body.storeId !== "string" || body.storeId.trim().length === 0) {
    return NextResponse.json({ ok: false, message: "storeId가 올바르지 않습니다." }, { status: 400 });
  }

  if (typeof body.bayId !== "string" || body.bayId.trim().length === 0) {
    return NextResponse.json({ ok: false, message: "입장 처리할 타석을 선택해주세요." }, { status: 400 });
  }

  // 관리자 수동 입장은 단체 손님 등 예외 상황을 처리해야 하므로
  // 고객용 이용시간표에 더해 1~8시간(1시간 단위)까지 허용한다.
  const durationMinutes = Number(body.durationMinutes);
  if (!isSupportedAdminDuration(durationMinutes)) {
    return NextResponse.json(
      { ok: false, message: `이용시간은 ${ADMIN_MIN_HOURS}~${ADMIN_MAX_HOURS}시간 사이로 입력해주세요.` },
      { status: 400 }
    );
  }

  const guestName = typeof body.guestName === "string" && body.guestName.trim() ? body.guestName.trim() : "현장 고객(관리자)";

  try {
    const supabase = createSupabaseAdminClient();
    const result = await startWalkInSession({
      supabase,
      storeId: body.storeId,
      bayId: body.bayId,
      durationMinutes,
      partySize: 1,
      guestName,
      memoPrefix: "관리자 접수"
    });

    return NextResponse.json({
      ok: true,
      bayId: result.bayId,
      bayCode: result.bayCode,
      startsAt: result.startsAt.toISOString(),
      endsAt: result.endsAt.toISOString(),
      durationMinutes: result.durationMinutes,
      price: result.price,
      reservationId: result.reservationId,
      accessSessionId: result.accessSessionId,
      automationStatus: result.automationStatus,
      automationDetail: result.automationDetail,
      message: "관리자 수동 입장 처리가 완료되었습니다."
    });
  } catch (error) {
    if (error instanceof Error && error.name === "BayUnavailableError") {
      return NextResponse.json({ ok: false, message: error.message }, { status: 409 });
    }

    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "관리자 수동 입장 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
