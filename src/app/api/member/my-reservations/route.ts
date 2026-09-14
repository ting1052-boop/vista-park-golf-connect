import { NextResponse } from "next/server";
import { createServerSupabaseClient, createSupabaseAdminClient } from "@/lib/supabase/server";

export async function GET() {
  const sessionClient = await createServerSupabaseClient();
  const { data: authData, error: authError } = await sessionClient.auth.getUser();

  if (authError || !authData.user) {
    return NextResponse.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 });
  }

  if (authData.user.app_metadata.provider !== "kakao") {
    return NextResponse.json({ ok: false, message: "카카오 로그인이 필요합니다." }, { status: 401 });
  }

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "서버 설정을 확인해주세요." },
      { status: 500 }
    );
  }
  const { data: member, error: memberError } = await admin
    .from("members")
    .select("id")
    .eq("login_provider", "kakao")
    .eq("provider_subject", authData.user.id)
    .maybeSingle();

  if (memberError) {
    return NextResponse.json({ ok: false, message: memberError.message }, { status: 500 });
  }
  if (!member) {
    return NextResponse.json({ ok: true, reservations: [] });
  }

  const { data, error } = await admin
    .from("reservations")
    .select("id, starts_at, status, approval_required, bays(bay_code)")
    .eq("member_id", member.id)
    .order("starts_at", { ascending: false })
    .limit(10);

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, reservations: data ?? [] });
}
