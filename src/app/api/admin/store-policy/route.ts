import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  getDefaultDurationOptions,
  getStoreDurationOptions,
  parseDurationOptions
} from "@/lib/reservation-policy-server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const CURRENT_STORE_ID = "11111111-1111-4111-8111-111111111111";

async function ensureAdmin() {
  try {
    await requireAdminUser();
    return null;
  } catch {
    return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  }
}

export async function GET() {
  const denied = await ensureAdmin();
  if (denied) return denied;

  try {
    const options = await getStoreDurationOptions(CURRENT_STORE_ID);
    return NextResponse.json({ ok: true, options, defaults: getDefaultDurationOptions() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "요금표를 불러오지 못했습니다." },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const denied = await ensureAdmin();
  if (denied) return denied;

  let body: { options?: unknown };
  try {
    body = (await request.json()) as { options?: unknown };
  } catch {
    return NextResponse.json({ ok: false, message: "요청 내용을 확인해 주세요." }, { status: 400 });
  }

  const parsed = parseDurationOptions(body.options);
  if ("error" in parsed) {
    return NextResponse.json({ ok: false, message: parsed.error }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from("store_settings")
      .upsert(
        { store_id: CURRENT_STORE_ID, duration_options: parsed.options, updated_at: new Date().toISOString() },
        { onConflict: "store_id" }
      );

    if (error) {
      // 컬럼이 아직 없으면(마이그레이션 미적용) 무엇을 해야 하는지 알려준다.
      const needsMigration = /duration_options/i.test(error.message);
      return NextResponse.json(
        {
          ok: false,
          message: needsMigration
            ? "요금표 저장 공간이 아직 준비되지 않았습니다. Supabase에서 202608210001_store_duration_options.sql 을 먼저 적용해주세요."
            : error.message
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, options: parsed.options, message: "요금표를 저장했습니다." });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "요금표 저장에 실패했습니다." },
      { status: 500 }
    );
  }
}
