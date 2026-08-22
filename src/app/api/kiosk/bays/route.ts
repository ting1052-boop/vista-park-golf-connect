import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { checkKioskKey, listBaysWithAvailability } from "@/lib/kiosk";
import { findDurationOption, getStoreDurationOptions } from "@/lib/reservation-policy-server";

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

  const targetStoreId = body.storeId;
  // 요금표는 관리자 요금설정을 따른다. 키오스크가 항상 최신 값을 쓰도록 함께 내려준다.
  const storeDurationOptions = await getStoreDurationOptions(targetStoreId);

  const durationMinutes = Number(body.durationMinutes);
  const selected = findDurationOption(storeDurationOptions, durationMinutes) ?? storeDurationOptions[0];
  if (!selected) {
    return NextResponse.json({ ok: false, message: "이용시간 설정이 비어 있습니다." }, { status: 500 });
  }

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + (selected.minutes + selected.bonusMinutes) * 60_000);

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
      durationOptions: storeDurationOptions,
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
