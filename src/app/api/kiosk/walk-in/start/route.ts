import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { checkKioskKey, findFreeBays, startKioskSession } from "@/lib/kiosk";
import { getBlockMinutes, isSupportedDuration, priceByDuration } from "@/lib/reservation-policy";

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
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + getBlockMinutes(durationMinutes) * 60_000);

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
    const freeBays = await findFreeBays(supabase, storeId, startsAt, endsAt);

    if (freeBays.length === 0) {
      return NextResponse.json(
        { ok: false, message: "현재 이용 가능한 타석이 없습니다. 잠시 후 다시 시도해주세요." },
        { status: 409 }
      );
    }

    // 고객이 배치도에서 특정 타석을 골랐으면 그 타석만 시도한다.
    // 자리를 지정하지 않았으면(자동 배정) 빈 타석 순서대로 시도한다.
    const requestedBayId = typeof body.bayId === "string" ? body.bayId : null;

    if (requestedBayId) {
      const chosen = freeBays.find((bay) => bay.id === requestedBayId);
      if (!chosen) {
        return NextResponse.json(
          { ok: false, message: "선택하신 타석이 방금 사용 중으로 바뀌었습니다. 다른 타석을 선택해주세요." },
          { status: 409 }
        );
      }
    }

    const candidates = requestedBayId ? freeBays.filter((bay) => bay.id === requestedBayId) : freeBays.slice(0, 3);

    // 동시 입장 경합 시 DB 배타 제약(23P01)에 걸리면 다음 빈 타석으로 재시도한다.
    let reservationId: string | null = null;
    let assignedBay: (typeof freeBays)[number] | null = null;

    for (const bay of candidates) {
      const { data: inserted, error: insertError } = await supabase
        .from("reservations")
        .insert({
          store_id: storeId,
          bay_id: bay.id,
          guest_name: "현장 고객",
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          party_size: partySize,
          channel: "walk_in",
          status: "checked_in",
          approval_required: false,
          // 후불이라 아직 미결제 상태. 관리자가 예약 메모에서 미수금을 확인한다.
          // (추후 payment_status 컬럼 + 입금확인 UI로 확장 예정)
          memo: `현장 이용 · 후불 계좌이체 · 미결제 ${priceByDuration[durationMinutes].toLocaleString("ko-KR")}원`
        })
        .select("id")
        .single();

      if (!insertError && inserted) {
        reservationId = inserted.id;
        assignedBay = bay;
        break;
      }

      if (insertError && insertError.code !== "23P01") {
        return NextResponse.json({ ok: false, message: insertError.message }, { status: 500 });
      }
    }

    if (!reservationId || !assignedBay) {
      return NextResponse.json(
        {
          ok: false,
          message: requestedBayId
            ? "선택하신 타석이 방금 마감되었습니다. 다른 타석을 선택해주세요."
            : "방금 다른 이용이 시작되어 타석이 마감되었습니다. 다시 시도해주세요."
        },
        { status: 409 }
      );
    }

    const session = await startKioskSession({
      supabase,
      storeId,
      bayId: assignedBay.id,
      reservationId,
      guestName: "현장 고객",
      partySize,
      startsAt,
      endsAt
    });

    return NextResponse.json({
      ok: true,
      bayCode: assignedBay.bay_code,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      durationMinutes,
      price: priceByDuration[durationMinutes],
      accessSessionId: session.accessSessionId,
      automationStatus: session.automationStatus,
      automationDetail: session.automationDetail
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "현장 이용 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
