import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { checkKioskKey, findFreeBays, getSeoulDayRange, startKioskSession } from "@/lib/kiosk";

type CheckInBody = {
  storeId?: unknown;
  phoneLast4?: unknown;
  reservationId?: unknown;
};

type ReservationRow = {
  id: string;
  store_id: string;
  bay_id: string | null;
  guest_name: string | null;
  guest_phone_last4: string | null;
  starts_at: string;
  ends_at: string;
  party_size: number;
  status: string;
  approval_required: boolean;
  bays: { bay_code: string | null; display_name: string | null } | Array<{ bay_code: string | null; display_name: string | null }> | null;
};

function getBayInfo(row: ReservationRow) {
  const bay = Array.isArray(row.bays) ? row.bays[0] : row.bays;
  return bay ?? null;
}

export async function POST(request: NextRequest) {
  if (!checkKioskKey(request)) {
    return NextResponse.json({ ok: false, message: "키오스크 인증에 실패했습니다." }, { status: 401 });
  }

  let body: CheckInBody;
  try {
    body = (await request.json()) as CheckInBody;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON 요청 본문을 확인해주세요." }, { status: 400 });
  }

  if (typeof body.storeId !== "string" || body.storeId.trim().length === 0) {
    return NextResponse.json({ ok: false, message: "storeId가 올바르지 않습니다." }, { status: 400 });
  }

  if (typeof body.phoneLast4 !== "string" || !/^\d{4}$/.test(body.phoneLast4)) {
    return NextResponse.json({ ok: false, message: "전화번호 뒤 4자리를 확인해주세요." }, { status: 400 });
  }

  const storeId = body.storeId;
  const phoneLast4 = body.phoneLast4;
  const { start, end } = getSeoulDayRange();

  let supabase;
  try {
    supabase = createSupabaseAdminClient();
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "서버 설정 오류" },
      { status: 500 }
    );
  }

  const { data: rows, error: lookupError } = await supabase
    .from("reservations")
    .select(
      "id, store_id, bay_id, guest_name, guest_phone_last4, starts_at, ends_at, party_size, status, approval_required, bays(bay_code, display_name)"
    )
    .eq("store_id", storeId)
    .eq("guest_phone_last4", phoneLast4)
    .gte("starts_at", start.toISOString())
    .lt("starts_at", end.toISOString())
    .in("status", ["requested", "confirmed", "checked_in"])
    .order("starts_at", { ascending: true });

  if (lookupError) {
    return NextResponse.json({ ok: false, message: lookupError.message }, { status: 500 });
  }

  const reservations = (rows ?? []) as unknown as ReservationRow[];

  // 조회 모드: reservationId가 없으면 오늘 예약 목록을 돌려준다.
  if (typeof body.reservationId !== "string" || body.reservationId.length === 0) {
    return NextResponse.json({
      ok: true,
      reservations: reservations.map((row) => ({
        id: row.id,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        partySize: row.party_size,
        status: row.status,
        approvalRequired: row.approval_required,
        guestName: row.guest_name,
        bayCode: getBayInfo(row)?.bay_code ?? null
      }))
    });
  }

  // 입장 모드
  const reservation = reservations.find((row) => row.id === body.reservationId);

  if (!reservation) {
    return NextResponse.json({ ok: false, message: "예약을 찾을 수 없습니다. 전화번호 뒤 4자리를 다시 확인해주세요." }, { status: 404 });
  }

  if (reservation.status === "requested" || reservation.approval_required) {
    return NextResponse.json(
      { ok: false, message: "매장 승인 대기 중인 예약입니다. 매장에 문의해주세요." },
      { status: 409 }
    );
  }

  const startsAt = new Date(reservation.starts_at);
  const endsAt = new Date(reservation.ends_at);

  if (endsAt.getTime() <= Date.now()) {
    return NextResponse.json({ ok: false, message: "이용 시간이 이미 지난 예약입니다. 매장에 문의해주세요." }, { status: 409 });
  }

  // 타석 미배정 예약이면 빈 타석을 자동 배정한다.
  let bayId = reservation.bay_id;
  let bayCode = getBayInfo(reservation)?.bay_code ?? null;

  if (!bayId) {
    const freeBays = await findFreeBays(supabase, storeId, startsAt, endsAt);

    if (freeBays.length === 0) {
      return NextResponse.json({ ok: false, message: "현재 이용 가능한 타석이 없습니다. 매장에 문의해주세요." }, { status: 409 });
    }

    const targetBay = freeBays[0];
    const { error: assignError } = await supabase
      .from("reservations")
      .update({ bay_id: targetBay.id, updated_at: new Date().toISOString() })
      .eq("id", reservation.id);

    if (assignError) {
      return NextResponse.json({ ok: false, message: `타석 배정에 실패했습니다: ${assignError.message}` }, { status: 500 });
    }

    bayId = targetBay.id;
    bayCode = targetBay.bay_code;
  }

  try {
    const session = await startKioskSession({
      supabase,
      storeId,
      bayId,
      reservationId: reservation.id,
      guestName: reservation.guest_name,
      partySize: reservation.party_size,
      startsAt,
      endsAt
    });

    const { error: statusError } = await supabase
      .from("reservations")
      .update({ status: "checked_in", updated_at: new Date().toISOString() })
      .eq("id", reservation.id);

    return NextResponse.json({
      ok: true,
      bayCode,
      startsAt: reservation.starts_at,
      endsAt: reservation.ends_at,
      partySize: reservation.party_size,
      accessSessionId: session.accessSessionId,
      automationStatus: session.automationStatus,
      automationDetail: session.automationDetail,
      statusUpdateError: statusError?.message ?? null
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "입장 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
