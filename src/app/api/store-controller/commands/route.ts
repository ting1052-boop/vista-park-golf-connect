import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { StoreControllerCommandPayload, StoreControllerCommandStatus } from "@/lib/store-controller";
import { prepareDueReservations } from "@/lib/reservation-prepare";
import { closeExpiredSessions } from "@/lib/session-cleanup";

const CURRENT_STORE_ID = "11111111-1111-4111-8111-111111111111";

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

const CONTROLLER_COMMAND_TYPES = ["prepare_bay", "release_bay", "run_scripts"] as const;
const COMMAND_MAX_AGE_MS = 15 * 60 * 1000;
const COMMAND_MAX_ATTEMPTS = 20;

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
  const staleBeforeIso = new Date(now.getTime() - COMMAND_MAX_AGE_MS).toISOString();
  const controllerId = getControllerId(request);
  const leaseExpiresAt = new Date(now.getTime() + 60_000).toISOString();

  // 매장 제어기가 상시 조회하는 이 엔드포인트를 종료·준비 스케줄러로 사용한다.
  // 종료를 먼저 처리해야 같은 타석에 OFF와 ON이 함께 생길 때 최종 순서가 ON이 된다.
  // 각 확인 실패는 격리해 기존 장비 명령 수령을 막지 않는다.
  try {
    const cleanup = await closeExpiredSessions(supabase, now, { storeId: CURRENT_STORE_ID });
    if (cleanup.failed > 0) {
      console.warn("만료 세션 일부 정리 실패", {
        scanned: cleanup.scanned,
        completed: cleanup.completed,
        failed: cleanup.failed
      });
    }
  } catch (error) {
    console.warn("만료 세션 정리 확인 실패", {
      error: error instanceof Error ? error.message : "unknown"
    });
  }

  // 곧 시작하는 예약의 타석을 미리 켠다.
  try {
    await prepareDueReservations(supabase, CURRENT_STORE_ID, now);
  } catch (error) {
    console.warn("예약 사전 준비 확인 실패", {
      error: error instanceof Error ? error.message : "unknown"
    });
  }

  // 제어기가 장시간 꺼졌다가 다시 켜져도 과거 ON/OFF 명령을 실행하지 않는다.
  // 운영 장비 명령은 생성 후 15분이 지나면 안전하게 폐기한다.
  const { error: stalePendingError } = await supabase
    .from("store_controller_commands")
    .update({
      status: "cancelled",
      completed_at: nowIso,
      lease_expires_at: null,
      error_message: "명령 유효시간(15분)이 지나 자동 취소되었습니다."
    })
    .eq("status", "pending")
    .in("command_type", [...CONTROLLER_COMMAND_TYPES])
    .lt("created_at", staleBeforeIso);

  if (stalePendingError) {
    return NextResponse.json({ ok: false, message: stalePendingError.message }, { status: 500 });
  }

  const { error: staleProcessingError } = await supabase
    .from("store_controller_commands")
    .update({
      status: "cancelled",
      completed_at: nowIso,
      lease_expires_at: null,
      error_message: "처리 중 응답이 끊겼고 명령 유효시간이 지나 자동 취소되었습니다."
    })
    .eq("status", "processing")
    .in("command_type", [...CONTROLLER_COMMAND_TYPES])
    .lt("lease_expires_at", nowIso)
    .lt("created_at", staleBeforeIso);

  if (staleProcessingError) {
    return NextResponse.json({ ok: false, message: staleProcessingError.message }, { status: 500 });
  }

  const { error: exhaustedError } = await supabase
    .from("store_controller_commands")
    .update({
      status: "failed",
      completed_at: nowIso,
      lease_expires_at: null,
      error_message: "제어기 재시도 한도를 초과했습니다."
    })
    .eq("status", "pending")
    .in("command_type", [...CONTROLLER_COMMAND_TYPES])
    .gte("attempts", COMMAND_MAX_ATTEMPTS);

  if (exhaustedError) {
    return NextResponse.json({ ok: false, message: exhaustedError.message }, { status: 500 });
  }

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
    .in("command_type", [...CONTROLLER_COMMAND_TYPES])
    .gte("created_at", staleBeforeIso)
    .lt("attempts", COMMAND_MAX_ATTEMPTS)
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
