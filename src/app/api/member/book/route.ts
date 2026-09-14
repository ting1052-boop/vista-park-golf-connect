import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getStoreDurationOptions } from "@/lib/reservation-policy-server";
import { createServerSupabaseClient, createSupabaseAdminClient } from "@/lib/supabase/server";

type BookingBody = {
  storeId?: unknown;
  bayId?: unknown;
  guestName?: unknown;
  phoneLast4?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  approvalRequired?: unknown;
};

const inactiveStatuses = ["cancelled", "no_show", "completed"];

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getKakaoDisplayName(metadata: Record<string, unknown>) {
  for (const key of ["user_name", "nickname", "full_name", "name"]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "카카오 회원";
}

function getSeoulDateAndMinutes(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "0";

  return {
    date: `${read("year")}-${read("month")}-${read("day")}`,
    minutes: Number(read("hour")) * 60 + Number(read("minute"))
  };
}

export async function POST(request: NextRequest) {
  const sessionClient = await createServerSupabaseClient();
  const { data: authData, error: authError } = await sessionClient.auth.getUser();

  if (authError || !authData.user) {
    return NextResponse.json({ ok: false, message: "카카오 로그인이 필요합니다." }, { status: 401 });
  }

  if (authData.user.app_metadata.provider !== "kakao") {
    return NextResponse.json({ ok: false, message: "카카오 로그인 계정으로 예약해주세요." }, { status: 403 });
  }

  let body: BookingBody;
  try {
    body = (await request.json()) as BookingBody;
  } catch {
    return NextResponse.json({ ok: false, message: "예약 내용을 확인해주세요." }, { status: 400 });
  }

  const storeId = readText(body.storeId);
  const bayId = readText(body.bayId);
  const guestName = readText(body.guestName);
  const phoneLast4 = readText(body.phoneLast4);
  const startsAt = new Date(readText(body.startsAt));
  const endsAt = new Date(readText(body.endsAt));
  const approvalRequired = body.approvalRequired === true;

  if (!storeId || !bayId || !guestName || !/^\d{4}$/.test(phoneLast4)) {
    return NextResponse.json({ ok: false, message: "예약자와 타석 정보를 확인해주세요." }, { status: 400 });
  }

  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || startsAt >= endsAt) {
    return NextResponse.json({ ok: false, message: "예약 시간을 확인해주세요." }, { status: 400 });
  }

  if (startsAt.getTime() <= Date.now()) {
    return NextResponse.json({ ok: false, message: "이미 지난 시간은 예약할 수 없습니다." }, { status: 400 });
  }

  // 허용 길이는 관리자 요금설정(이용시간 + 서비스 시간)에서 가져온다.
  // 값을 여기에 적어두면 요금표를 바꿀 때마다 예약이 조용히 막힌다.
  const reservedMinutes = Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000);
  const storeDurationOptions = await getStoreDurationOptions(storeId);
  const allowedReservedMinutes = storeDurationOptions.map((option) => option.minutes + option.bonusMinutes);
  if (!allowedReservedMinutes.includes(reservedMinutes)) {
    return NextResponse.json({ ok: false, message: "선택할 수 없는 이용시간입니다." }, { status: 400 });
  }

  const localStart = getSeoulDateAndMinutes(startsAt);
  const localEnd = getSeoulDateAndMinutes(endsAt);
  if (localStart.date !== localEnd.date || localStart.minutes < 8 * 60 || localEnd.minutes > 21 * 60) {
    return NextResponse.json({ ok: false, message: "예약 가능 시간은 오전 8시부터 오후 9시까지입니다." }, { status: 400 });
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

  const { data: bay, error: bayError } = await admin
    .from("bays")
    .select("id, store_id, status")
    .eq("id", bayId)
    .eq("store_id", storeId)
    .maybeSingle();

  if (bayError || !bay || bay.status === "maintenance") {
    return NextResponse.json({ ok: false, message: "선택한 타석을 예약할 수 없습니다." }, { status: 409 });
  }

  const { data: conflicts, error: conflictError } = await admin
    .from("reservations")
    .select("id")
    .eq("bay_id", bayId)
    .not("status", "in", `(${inactiveStatuses.join(",")})`)
    .lt("starts_at", endsAt.toISOString())
    .gt("ends_at", startsAt.toISOString())
    .limit(1);

  if (conflictError) {
    return NextResponse.json({ ok: false, message: conflictError.message }, { status: 500 });
  }
  if (conflicts && conflicts.length > 0) {
    return NextResponse.json({ ok: false, message: "방금 다른 예약이 접수되어 선택한 시간이 마감되었습니다." }, { status: 409 });
  }

  const metadata = authData.user.user_metadata as Record<string, unknown>;
  const displayName = guestName || getKakaoDisplayName(metadata);
  const providerSubject = authData.user.id;
  const phoneHash = createHash("sha256").update(`social-member:${authData.user.id}`).digest("hex");

  const { error: userError } = await admin.from("users").upsert(
    {
      id: authData.user.id,
      display_name: displayName,
      updated_at: new Date().toISOString()
    },
    { onConflict: "id" }
  );

  if (userError && userError.code !== "42P01") {
    return NextResponse.json({ ok: false, message: `회원 계정 연결 실패: ${userError.message}` }, { status: 500 });
  }

  const { data: existingMember, error: memberLookupError } = await admin
    .from("members")
    .select("id")
    .eq("login_provider", "kakao")
    .eq("provider_subject", providerSubject)
    .maybeSingle();

  if (memberLookupError) {
    return NextResponse.json({ ok: false, message: memberLookupError.message }, { status: 500 });
  }

  let memberId = existingMember?.id as string | undefined;
  if (memberId) {
    const { error: updateError } = await admin
      .from("members")
      .update({
        primary_store_id: storeId,
        nickname: displayName,
        login_provider: "kakao",
        provider_subject: providerSubject,
        phone_hash: phoneHash,
        phone_last4: phoneLast4,
        is_guest: false,
        updated_at: new Date().toISOString()
      })
      .eq("id", memberId);

    if (updateError) {
      return NextResponse.json({ ok: false, message: updateError.message }, { status: 500 });
    }
  } else {
    const { data: createdMember, error: createError } = await admin
      .from("members")
      .insert({
        primary_store_id: storeId,
        nickname: displayName,
        login_provider: "kakao",
        provider_subject: providerSubject,
        phone_hash: phoneHash,
        phone_last4: phoneLast4,
        is_guest: false
      })
      .select("id")
      .single();

    if (createError || !createdMember) {
      return NextResponse.json({ ok: false, message: createError?.message ?? "회원 정보를 만들지 못했습니다." }, { status: 500 });
    }
    memberId = createdMember.id as string;
  }

  const { error: insertError } = await admin.from("reservations").insert({
    store_id: storeId,
    bay_id: bayId,
    member_id: memberId,
    guest_name: displayName,
    guest_phone_last4: phoneLast4,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    party_size: 1,
    channel: "member_app",
    status: approvalRequired ? "requested" : "confirmed",
    approval_required: approvalRequired,
    memo: approvalRequired ? "카카오 회원 예약, 매장 승인 필요" : "카카오 회원 예약, 자동 확정"
  });

  if (insertError) {
    const status = insertError.code === "23P01" ? 409 : 500;
    const message = insertError.code === "23P01" ? "선택한 타석·시간대가 이미 예약되어 있습니다." : insertError.message;
    return NextResponse.json({ ok: false, message }, { status });
  }

  return NextResponse.json({ ok: true, message: approvalRequired ? "예약 신청이 접수되었습니다." : "예약이 확정되었습니다." });
}
