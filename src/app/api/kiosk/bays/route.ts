import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { checkKioskKey, listBaysWithAvailability } from "@/lib/kiosk";
import { getBlockMinutes, isSupportedDuration } from "@/lib/reservation-policy";

type BaysBody = {
  storeId?: unknown;
  durationMinutes?: unknown;
};

export async function POST(request: NextRequest) {
  if (!checkKioskKey(request)) {
    return NextResponse.json({ ok: false, message: "키오스크 인증에 실패했습니다." }, { status: 401 });
  }

  let body: BaysBody;
  try {
    body = (await request.json()) as BaysBody;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON 요청 본문을 확인해주세요." }, { status: 400 });
  }

  if (typeof body.storeId !== "string" || body.storeId.trim().length === 0) {
    return NextResponse.json({ ok: false, message: "storeId가 올바르지 않습니다." }, { status: 400 });
  }

  const durationMinutes = Number(body.durationMinutes);
  if (!isSupportedDuration(durationMinutes)) {
    return NextResponse.json({ ok: false, message: "이용시간이 올바르지 않습니다." }, { status: 400 });
  }

  const targetStoreId = body.storeId;
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
    const bays = await listBaysWithAvailability(supabase, targetStoreId, startsAt, endsAt);
    return NextResponse.json({
      ok: true,
      bays: bays.map((bay) => ({
        id: bay.id,
        bayCode: bay.bay_code,
        displayName: bay.display_name,
        status: bay.status,
        isFree: bay.isFree
      }))
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "타석 정보를 불러오지 못했습니다." },
      { status: 500 }
    );
  }
}
