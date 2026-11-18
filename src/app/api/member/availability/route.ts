import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

// 예약 가능 시간 계산용. 로그인 회원은 DB 권한상 다른 사람 예약을 읽을 수 없으므로
// 서버에서 타석·시간·상태만 돌려준다(이름·전화 등 개인정보 열은 내보내지 않는다).
const MAX_RANGE_MS = 4 * 24 * 60 * 60 * 1000; // 화면은 오늘~모레(+2시간)만 조회한다

export async function GET(request: NextRequest) {
  const from = new Date(request.nextUrl.searchParams.get("from") ?? "");
  const to = new Date(request.nextUrl.searchParams.get("to") ?? "");

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from || to.getTime() - from.getTime() > MAX_RANGE_MS) {
    return NextResponse.json({ ok: false, message: "조회 기간을 확인해주세요." }, { status: 400 });
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

  const { data, error } = await supabase
    .from("reservations")
    .select("bay_id, starts_at, ends_at, status")
    .gte("ends_at", from.toISOString())
    .lte("starts_at", to.toISOString());

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, reservations: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
