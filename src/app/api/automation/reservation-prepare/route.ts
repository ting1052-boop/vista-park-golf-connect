import { NextRequest, NextResponse } from "next/server";
import { commonAutomationScripts, getBayAutomationByCode } from "@/lib/automation/device-map";
import { runHomeAssistantScript } from "@/lib/automation/ha-client";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type DueReservationRow = {
  id: string;
  store_id: string;
  bay_id: string;
  starts_at: string;
};

type BayRow = {
  id: string;
  store_id: string;
  bay_code: string | null;
};

const PREPARE_WINDOW_MINUTES = 5;
const GRACE_WINDOW_MINUTES = 15;
const MAX_RESERVATIONS_PER_RUN = 20;

function getRequestSecret(request: NextRequest) {
  const headerSecret = request.headers.get("x-cron-secret") ?? request.headers.get("x-iot-webhook-secret");
  const authorization = request.headers.get("authorization");
  const bearerSecret = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : null;

  return headerSecret ?? bearerSecret;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

async function logAutomation(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  args: {
    storeId: string;
    reservationId: string;
    eventName: string;
    command: string;
    status: "success" | "failed" | "skipped";
    requestPayload: Record<string, unknown>;
    responsePayload?: Record<string, unknown>;
    errorMessage?: string | null;
  }
) {
  const { error } = await supabase.from("automation_logs").insert({
    store_id: args.storeId,
    reservation_id: args.reservationId,
    event_name: args.eventName,
    command: args.command,
    status: args.status,
    request_payload: args.requestPayload,
    response_payload: args.responsePayload ?? {},
    error_message: args.errorMessage ?? null
  });

  return error?.message ?? null;
}

async function runPreparationForReservation(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  reservation: DueReservationRow
) {
  const { data: bayData, error: bayError } = await supabase
    .from("bays")
    .select("id, store_id, bay_code")
    .eq("id", reservation.bay_id)
    .maybeSingle();

  if (bayError) {
    throw new Error(bayError.message);
  }

  if (!bayData) {
    await logAutomation(supabase, {
      storeId: reservation.store_id,
      reservationId: reservation.id,
      eventName: "예약 5분 전 준비",
      command: "bay_not_found",
      status: "skipped",
      requestPayload: reservation,
      errorMessage: "예약에 연결된 타석을 찾을 수 없습니다."
    });

    return { reservationId: reservation.id, ok: false, skipped: true, message: "타석 없음" };
  }

  const bay = bayData as BayRow;
  const bayAutomation = getBayAutomationByCode(bay.bay_code);

  if (!bayAutomation) {
    await logAutomation(supabase, {
      storeId: reservation.store_id,
      reservationId: reservation.id,
      eventName: "예약 5분 전 준비",
      command: "automation_mapping_not_found",
      status: "skipped",
      requestPayload: { reservation, bay },
      errorMessage: `자동화 매핑이 없는 타석입니다: ${bay.bay_code ?? bay.id}`
    });

    return { reservationId: reservation.id, ok: false, skipped: true, message: "자동화 매핑 없음" };
  }

  const variables = {
    reservationId: reservation.id,
    storeId: reservation.store_id,
    bayId: bay.id,
    bayCode: bay.bay_code,
    startsAt: reservation.starts_at,
    reason: "reservation_prepare_5_minutes_before"
  };

  const sharedResult = await runHomeAssistantScript(commonAutomationScripts.on, variables);
  await logAutomation(supabase, {
    storeId: reservation.store_id,
    reservationId: reservation.id,
    eventName: "예약 5분 전 공용 장비 준비",
    command: commonAutomationScripts.on,
    status: sharedResult.ok ? "success" : "failed",
    requestPayload: variables,
    responsePayload: sharedResult,
    errorMessage: sharedResult.ok ? null : `Home Assistant 응답 실패: ${sharedResult.status}`
  });

  const bayResult = await runHomeAssistantScript(bayAutomation.enterScript, variables);
  await logAutomation(supabase, {
    storeId: reservation.store_id,
    reservationId: reservation.id,
    eventName: "예약 5분 전 타석 장비 준비",
    command: bayAutomation.enterScript,
    status: bayResult.ok ? "success" : "failed",
    requestPayload: variables,
    responsePayload: bayResult,
    errorMessage: bayResult.ok ? null : `Home Assistant 응답 실패: ${bayResult.status}`
  });

  const ok = sharedResult.ok && bayResult.ok;

  if (ok) {
    const { error: updateError } = await supabase
      .from("reservations")
      .update({
        automation_prepare_status: "success",
        automation_prepared_at: new Date().toISOString()
      })
      .eq("id", reservation.id);

    if (updateError) {
      throw new Error(updateError.message);
    }
  } else {
    await supabase
      .from("reservations")
      .update({
        automation_prepare_status: "failed"
      })
      .eq("id", reservation.id);
  }

  return {
    reservationId: reservation.id,
    ok,
    skipped: false,
    sharedStatus: sharedResult.status,
    bayStatus: bayResult.status
  };
}

export async function GET(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET ?? process.env.IOT_WEBHOOK_SECRET;

  if (!expectedSecret) {
    return NextResponse.json({ ok: false, message: "CRON_SECRET 또는 IOT_WEBHOOK_SECRET 환경변수가 필요합니다." }, { status: 500 });
  }

  if (getRequestSecret(request) !== expectedSecret) {
    return NextResponse.json({ ok: false, message: "예약 준비 자동화 인증에 실패했습니다." }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const now = new Date();
  const windowStart = addMinutes(now, -GRACE_WINDOW_MINUTES).toISOString();
  const windowEnd = addMinutes(now, PREPARE_WINDOW_MINUTES).toISOString();

  const { data, error } = await supabase
    .from("reservations")
    .select("id, store_id, bay_id, starts_at")
    .eq("status", "confirmed")
    .not("bay_id", "is", null)
    .is("automation_prepared_at", null)
    .gte("starts_at", windowStart)
    .lte("starts_at", windowEnd)
    .order("starts_at", { ascending: true })
    .limit(MAX_RESERVATIONS_PER_RUN);

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  const reservations = (data ?? []) as DueReservationRow[];
  const results = [];

  for (const reservation of reservations) {
    try {
      results.push(await runPreparationForReservation(supabase, reservation));
    } catch (error) {
      const message = error instanceof Error ? error.message : "예약 준비 자동화 중 오류가 발생했습니다.";
      await supabase
        .from("reservations")
        .update({
          automation_prepare_status: "failed"
        })
        .eq("id", reservation.id);

      await logAutomation(supabase, {
        storeId: reservation.store_id,
        reservationId: reservation.id,
        eventName: "예약 5분 전 준비",
        command: "reservation_prepare",
        status: "failed",
        requestPayload: reservation,
        errorMessage: message
      });

      results.push({ reservationId: reservation.id, ok: false, skipped: false, message });
    }
  }

  return NextResponse.json({
    ok: results.every((result) => result.ok || result.skipped),
    checkedAt: now.toISOString(),
    windowStart,
    windowEnd,
    count: reservations.length,
    results
  });
}

export const POST = GET;
