import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  INACTIVE_RESERVATION_STATUSES,
  collectAllRows,
  isPublicReservationStore,
  parseAvailabilityQuery,
  toAvailabilityRows
} from "@/lib/reservation-availability";

// 예약 가능 시간 계산용. 로그인 회원은 DB 권한상 다른 사람 예약을 읽을 수 없으므로
// 서버에서 선택 매장의 유효 예약만 타석·시간·상태로 돌려준다(이름·전화 등 개인정보 열 없음).
export async function GET(request: NextRequest) {
  const query = parseAvailabilityQuery(request.nextUrl.searchParams);
  if ("error" in query) {
    return NextResponse.json({ ok: false, message: query.error }, { status: 400 });
  }

  let supabase;
  try {
    supabase = createSupabaseAdminClient();
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "서버 설정 오류" },
      { status: 500 }
    );
  }

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id, status")
    .eq("id", query.storeId)
    .maybeSingle();

  if (storeError) {
    return NextResponse.json({ ok: false, message: "매장 정보를 확인하지 못했습니다." }, { status: 500 });
  }
  // 없는 매장·비공개·예약 미사용 매장은 구분 없이 같은 응답.
  if (!isPublicReservationStore(store)) {
    return NextResponse.json({ ok: false, message: "예약할 수 없는 매장입니다." }, { status: 404 });
  }

  const result = await collectAllRows<Record<string, unknown>>((from, to) =>
    supabase
      .from("reservations")
      .select("bay_id, starts_at, ends_at, status", { count: "exact" })
      .eq("store_id", query.storeId)
      .not("status", "in", `(${INACTIVE_RESERVATION_STATUSES.join(",")})`)
      .gte("ends_at", query.from.toISOString())
      .lte("starts_at", query.to.toISOString())
      .order("starts_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)
  );

  if ("error" in result) {
    return NextResponse.json({ ok: false, message: result.error }, { status: 503 });
  }

  return NextResponse.json(
    { ok: true, complete: true, reservations: toAvailabilityRows(result.rows) },
    { headers: { "Cache-Control": "no-store" } }
  );
}
