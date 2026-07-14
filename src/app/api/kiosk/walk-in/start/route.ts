import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { checkKioskKey, startWalkInSession } from "@/lib/kiosk";
import { isSupportedDuration } from "@/lib/reservation-policy";

type WalkInBody = {
  storeId?: unknown;
  partySize?: unknown;
  durationMinutes?: unknown;
  paymentStatus?: unknown;
  bayId?: unknown;
};

export async function POST(request: NextRequest) {
  if (!checkKioskKey(request)) {
    return NextResponse.json({ ok: false, message: "키오스크 인증에 실패했습니다." }, { status: 401 });
  }

  let body: WalkInBody;
  try {
    body = (await request.json()) as WalkInBody;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON 요청 본문을 확인해주세요." }, { status: 400 });
  }

  if (typeof body.storeId !== "string" || body.storeId.trim().length === 0) {
    return NextResponse.json({ ok: false, message: "storeId가 올바르지 않습니다." }, { status: 400 });
  }

  const partySize = Number(body.partySize);
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 6) {
    return NextResponse.json({ ok: false, message: "인원은 1~6명만 선택할 수 있습니다." }, { status: 400 });
  }

  const durationMinutes = Number(body.durationMinutes);
  if (!isSupportedDuration(durationMinutes)) {
    return NextResponse.json({ ok: false, message: "이용시간이 올바르지 않습니다." }, { status: 400 });
  }

  // 현재는 후불(계좌이체)만 운영한다. 이용을 먼저 시작하고 요금은 나중에
  // 계좌로 입금한다. (추후 네이버페이/카카오페이 QR 결제를 붙일 때 값 추가)
  if (body.paymentStatus !== "postpaid") {
    return NextResponse.json({ ok: false, message: "결제 방식이 올바르지 않습니다." }, { status: 400 });
  }

  const storeId = body.storeId;

  let supabase;
  try {
    supabase = createSupabaseAdminClient();
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "서버 설정 오류" },
      { status: 500 }
    );
  }

  try {
    const session = await startWalkInSession({
      supabase,
      storeId,
      partySize,
      durationMinutes,
      bayId: typeof body.bayId === "string" ? body.bayId : null,
      guestName: "현장 고객",
      memoPrefix: "현장 이용"
    });

    return NextResponse.json({
      ok: true,
      bayCode: session.bayCode,
      startsAt: session.startsAt.toISOString(),
      endsAt: session.endsAt.toISOString(),
      durationMinutes: session.durationMinutes,
      price: session.price,
      accessSessionId: session.accessSessionId,
      automationStatus: session.automationStatus,
      automationDetail: session.automationDetail
    });
  } catch (error) {
    if (error instanceof Error && error.name === "BayUnavailableError") {
      return NextResponse.json({ ok: false, message: error.message }, { status: 409 });
    }

    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "현장 이용 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
