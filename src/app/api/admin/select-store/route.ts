import { NextRequest, NextResponse } from "next/server";
import { getOptionalAdminContext, HEAD_STORE_COOKIE } from "@/lib/admin-context";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

// 본사관리자가 보는 매장을 바꾼다. 쿠키에만 저장하고, getAdminContext 가
// 본사관리자일 때만 이 쿠키를 읽는다. 매장관리자는 이 API 를 써도 거부된다.
export async function POST(request: NextRequest) {
  const context = await getOptionalAdminContext();
  if (!context) {
    return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  }
  if (!context.isHeadAdmin) {
    return NextResponse.json({ ok: false, message: "본사관리자만 매장을 바꿀 수 있습니다." }, { status: 403 });
  }

  let storeId: string | null = null;
  try {
    const body = await request.json();
    storeId = typeof body?.storeId === "string" ? body.storeId.trim() : null;
  } catch {
    return NextResponse.json({ ok: false, message: "요청 본문을 확인해주세요." }, { status: 400 });
  }
  if (!storeId) {
    return NextResponse.json({ ok: false, message: "매장을 선택해주세요." }, { status: 400 });
  }

  // 실제 존재하는 매장인지 확인한다. 조작된 값이 쿠키에 들어가지 않게 한다.
  const supabase = createSupabaseAdminClient();
  const { data: store, error } = await supabase.from("stores").select("id, name").eq("id", storeId).maybeSingle();
  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }
  if (!store) {
    return NextResponse.json({ ok: false, message: "존재하지 않는 매장입니다." }, { status: 404 });
  }

  const response = NextResponse.json({ ok: true, store });
  response.cookies.set(HEAD_STORE_COOKIE, storeId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180
  });
  return response;
}
