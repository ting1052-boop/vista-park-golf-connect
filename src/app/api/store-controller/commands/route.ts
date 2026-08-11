import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { StoreControllerCommandPayload, StoreControllerCommandStatus } from "@/lib/store-controller";

type CommandRow = {
  id: string;
  store_id: string;
  bay_id: string | null;
  access_session_id: string | null;
  reservation_id: string | null;
  command_type: string;
  payload: StoreControllerCommandPayload;
  attempts: number;
};

function getControllerId(request: NextRequest) {
  return request.headers.get("x-store-controller-id")?.trim() || "vista-store-controller";
}

function hasValidControllerToken(request: NextRequest) {
  const expected = process.env.STORE_CONTROLLER_TOKEN;
  const authorization = request.headers.get("authorization");
  const received = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!expected || !received) return false;

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

function unauthorized() {
  return NextResponse.json({ ok: false, message: "매장 제어기 인증에 실패했습니다." }, { status: 401 });
}

function parseLimit(value: string | null) {
  const parsed = Number(value ?? "5");
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, 1), 10) : 5;
}

export async function GET(request: NextRequest) {
  if (!hasValidControllerToken(request)) return unauthorized();

  let supabase;
  try {
    supabase = createSupabaseAdminClient();
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "서버 설정 오류" }, { status: 500 });
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const controllerId = getControllerId(request);
  const leaseExpiresAt = new Date(now.getTime() + 60_000).toISOString();

  const { error: recoverError } = await supabase
    .from("store_controller_commands")
    .update({ status: "pending", controller_id: null, lease_expires_at: null })
    .eq("status", "processing")
    .lt("lease_expires_at", nowIso);

  if (recoverError) return NextResponse.json({ ok: false, message: recoverError.message }, { status: 500 });

  const { data: pending, error: pendingError } = await supabase
    .from("store_controller_commands")
    .select("id, store_id, bay_id, access_session_id, reservation_id, command_type, payload, attempts")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(parseLimit(request.nextUrl.searchParams.get("limit")));

  if (pendingError) return NextResponse.json({ ok: false, message: pendingError.message }, { status: 500 });

  const claimed: CommandRow[] = [];
  for (const candidate of (pending ?? []) as CommandRow[]) {
    const { data, error } = await supabase
      .from("store_controller_commands")
      .update({
        status: "processing",
        controller_id: controllerId,
        lease_expires_at: leaseExpiresAt,
        attempts: candidate.attempts + 1
      })
      .eq("id", candidate.id)
      .eq("status", "pending")
      .select("id, store_id, bay_id, access_session_id, reservation_id, command_type, payload, attempts")
      .maybeSingle();

    if (!error && data) claimed.push(data as CommandRow);
  }

  return NextResponse.json({
    ok: true,
    serverTime: nowIso,
    commands: claimed.map((command) => ({
      id: command.id,
      type: command.command_type,
      bayId: command.bay_id,
      accessSessionId: command.access_session_id,
      reservationId: command.reservation_id,
      payload: command.payload,
      attempt: command.attempts
    }))
  });
}

type ResultBody = { commandId?: unknown; ok?: unknown; steps?: unknown; error?: unknown };

export async function POST(request: NextRequest) {
  if (!hasValidControllerToken(request)) return unauthorized();

  let body: ResultBody;
  try {
    body = (await request.json()) as ResultBody;
  } catch {
    return NextResponse.json({ ok: false, message: "결과 형식을 읽지 못했습니다." }, { status: 400 });
  }

  if (typeof body.commandId !== "string" || typeof body.ok !== "boolean") {
    return NextResponse.json({ ok: false, message: "명령 ID 또는 실행 결과가 올바르지 않습니다." }, { status: 400 });
  }

  let supabase;
  try {
    supabase = createSupabaseAdminClient();
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "서버 설정 오류" }, { status: 500 });
  }

  const controllerId = getControllerId(request);
  const { data: completed, error: completeError } = await supabase
    .from("store_controller_commands")
    .update({
      status: body.ok ? "succeeded" : "failed",
      completed_at: new Date().toISOString(),
      lease_expires_at: null,
      response_payload: { steps: Array.isArray(body.steps) ? body.steps : [] },
      error_message: typeof body.error === "string" ? body.error.slice(0, 1000) : null
    })
    .eq("id", body.commandId)
    .eq("status", "processing")
    .eq("controller_id", controllerId)
    .select("store_id, access_session_id, reservation_id, payload")
    .maybeSingle();

  if (completeError) return NextResponse.json({ ok: false, message: completeError.message }, { status: 500 });
  if (!completed) return NextResponse.json({ ok: false, message: "처리 중인 명령을 찾지 못했습니다." }, { status: 409 });

  const status: Extract<StoreControllerCommandStatus, "succeeded" | "failed"> = body.ok ? "succeeded" : "failed";
  await supabase.from("automation_logs").insert({
    store_id: completed.store_id,
    access_session_id: completed.access_session_id,
    reservation_id: completed.reservation_id,
    event_name: "매장 로컬 제어기 장비 준비",
    command: "store_controller_prepare",
    status: status === "succeeded" ? "success" : "failed",
    request_payload: completed.payload,
    response_payload: { controllerId, steps: Array.isArray(body.steps) ? body.steps : [] },
    error_message: typeof body.error === "string" ? body.error.slice(0, 1000) : null
  });

  return NextResponse.json({ ok: true });
}
