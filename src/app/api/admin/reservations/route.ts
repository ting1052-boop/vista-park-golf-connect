import { NextRequest, NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin-context";
import { SONGDO_STORE_ID } from "@/lib/automation/device-map";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { toReservationErrorMessage } from "@/lib/supabase/reservation-errors";

const columns = "id,starts_at,guest_name,party_size,channel,status,approval_required,memo,bays(bay_code)";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class RequestError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

function draftValues(body: Record<string, unknown>) {
  const { starts_at, guest_name, party_size, memo, bay_code } = body;
  const channel = body.channel === "" ? "admin" : body.channel;
  const status = body.status === "" ? "requested" : body.status;
  const approval_policy = body.approval_policy === "" ? "자동 확정" : body.approval_policy;
  // The browser converts datetime-local to ISO; do not interpret it in the server timezone.
  if (typeof starts_at !== "string" || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(starts_at)) {
    throw new RequestError("예약시간은 시간대가 포함된 ISO 형식이어야 합니다.");
  }
  const start = new Date(starts_at);
  const calendar = new Date(`${starts_at.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== starts_at.slice(0, 10)) {
    throw new RequestError("예약시간이 올바르지 않습니다.");
  }
  if (typeof guest_name !== "string" || !guest_name.trim() || guest_name.trim().length > 200) {
    throw new RequestError("고객명은 1~200자로 입력해주세요.");
  }
  const size = party_size === "" ? 1 : typeof party_size === "number" || (typeof party_size === "string" && party_size.trim()) ? Number(party_size) : NaN;
  if (!Number.isInteger(size) || size < 1 || size > 8) throw new RequestError("인원은 1~8명이어야 합니다.");
  if (typeof channel !== "string" || !["member_app", "phone", "walk_in", "admin"].includes(channel)) throw new RequestError("접수경로가 올바르지 않습니다.");
  if (typeof status !== "string" || !["requested", "confirmed", "checked_in", "completed", "cancelled", "no_show"].includes(status)) throw new RequestError("예약 상태가 올바르지 않습니다.");
  if (approval_policy !== "자동 확정" && approval_policy !== "매장 승인") throw new RequestError("승인정책이 올바르지 않습니다.");
  if (memo !== undefined && (typeof memo !== "string" || memo.length > 5000)) throw new RequestError("메모는 5000자 이내로 입력해주세요.");
  if (bay_code !== undefined && (typeof bay_code !== "string" || bay_code.trim().length > 50)) throw new RequestError("타석 코드가 올바르지 않습니다.");
  return {
    guest_name: guest_name.trim(), starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + 60 * 60 * 1000).toISOString(),
    party_size: size, channel, status, approval_required: approval_policy === "매장 승인",
    memo: typeof memo === "string" ? memo.trim() || null : null
  };
}

async function handle(request: NextRequest, method: "GET" | "POST" | "PATCH" | "DELETE") {
  let context: Awaited<ReturnType<typeof getAdminContext>>;
  try { context = await getAdminContext(); }
  catch { return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 }); }

  try {
    let body: Record<string, unknown> = {};
    if (method !== "GET") {
      let parsed: unknown;
      try { parsed = await request.json(); }
      catch { throw new RequestError("JSON 요청 본문을 확인해주세요."); }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new RequestError("JSON 객체가 필요합니다.");
      body = parsed as Record<string, unknown>;
    }
    const storeId = method === "GET" ? request.nextUrl.searchParams.get("storeId") : body.storeId;
    if (storeId !== context.storeId) throw new RequestError("현재 선택된 매장만 예약을 관리할 수 있습니다.", 403);
    if (context.storeId === SONGDO_STORE_ID) {
      if (method === "GET") return NextResponse.json({ ok: true, storeId: context.storeId, rows: [] });
      throw new RequestError("VISTA 예약 미사용 매장입니다.", 409);
    }
    if ((method === "PATCH" || method === "DELETE") && (typeof body.id !== "string" || !uuid.test(body.id))) {
      throw new RequestError("예약 ID가 올바르지 않습니다.");
    }
    const values = method === "POST" || method === "PATCH" ? draftValues(body) : null;
    const supabase = createSupabaseAdminClient();
    if (method === "GET") {
      const { data, error } = await supabase.from("reservations").select(columns).eq("store_id", context.storeId).order("starts_at", { ascending: false });
      if (error) throw error;
      return NextResponse.json({ ok: true, storeId: context.storeId, rows: data ?? [] });
    }
    let bayId: string | null = null;
    const bayCode = typeof body.bay_code === "string" ? body.bay_code.trim().toUpperCase() : "";
    if (values && bayCode) {
      const { data, error } = await supabase.from("bays").select("id").eq("store_id", context.storeId).eq("bay_code", bayCode).maybeSingle();
      if (error) throw error;
      if (!data) throw new RequestError("선택한 매장에 해당 타석이 없습니다.");
      bayId = data.id;
    }
    const query = method === "POST"
      ? supabase.from("reservations").insert({ ...values, bay_id: bayId, store_id: context.storeId })
      : method === "PATCH"
        ? supabase.from("reservations").update({ ...values, bay_id: bayId, updated_at: new Date().toISOString() }).eq("store_id", context.storeId).eq("id", body.id)
        : supabase.from("reservations").delete().eq("store_id", context.storeId).eq("id", body.id);
    const { data, error } = await query.select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new RequestError("예약을 찾을 수 없습니다.", 404);
    return NextResponse.json({ ok: true, storeId: context.storeId, id: data.id });
  } catch (error) {
    const conflict = typeof error === "object" && error !== null && "code" in error && error.code === "23P01";
    return NextResponse.json({ ok: false, message: error instanceof RequestError ? error.message : conflict ? toReservationErrorMessage(error as Parameters<typeof toReservationErrorMessage>[0]) : "예약 처리 중 오류가 발생했습니다." },
      { status: error instanceof RequestError ? error.status : conflict ? 409 : 500 });
  }
}

export async function GET(request: NextRequest) { return handle(request, "GET"); }
export async function POST(request: NextRequest) { return handle(request, "POST"); }
export async function PATCH(request: NextRequest) { return handle(request, "PATCH"); }
export async function DELETE(request: NextRequest) { return handle(request, "DELETE"); }
