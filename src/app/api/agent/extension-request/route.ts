import { NextRequest, NextResponse } from "next/server";
import {
  addMinutes,
  getAgentByToken,
  getStoreExtensionSettings,
  touchAgent,
  type StoreExtensionSettings
} from "@/lib/agent-server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type ExtensionRequestBody = {
  accessSessionId?: unknown;
  requestedMinutes?: unknown;
  priceAmount?: unknown;
};

type AccessSessionRow = {
  id: string;
  store_id: string;
  bay_id: string;
  reservation_id: string | null;
  status: string;
  started_at: string | null;
  ends_at: string | null;
};

type NextReservationRow = {
  id: string;
  starts_at: string;
};

function getRequestedMinutes(body: ExtensionRequestBody, settings: StoreExtensionSettings) {
  const requested = Number(body.requestedMinutes);
  if (Number.isInteger(requested) && requested >= 1 && requested <= 240) {
    return requested;
  }

  return settings.extension_minutes;
}

function getPriceAmount(body: ExtensionRequestBody, settings: StoreExtensionSettings) {
  const requested = Number(body.priceAmount);
  if (Number.isInteger(requested) && requested >= 0) {
    return requested;
  }

  return settings.extension_price;
}

function getApprovalTarget(
  sessionEndsAt: Date,
  requestedEndsAt: Date,
  nextReservation: NextReservationRow | null,
  settings: StoreExtensionSettings
) {
  if (!nextReservation) {
    return { status: "full" as const, approvedEndsAt: requestedEndsAt, message: "연장이 승인되었습니다." };
  }

  const bufferEndsAt = addMinutes(new Date(nextReservation.starts_at), -settings.extension_buffer_minutes);

  if (requestedEndsAt <= bufferEndsAt) {
    return { status: "full" as const, approvedEndsAt: requestedEndsAt, message: "연장이 승인되었습니다." };
  }

  if (settings.conflict_policy === "manual_review") {
    return {
      status: "manual" as const,
      approvedEndsAt: null,
      message: "다음 예약과 시간이 가까워 관리자 확인이 필요합니다."
    };
  }

  if (settings.conflict_policy === "reject") {
    return {
      status: "reject" as const,
      approvedEndsAt: null,
      message: "다음 예약 시간이 가까워 연장할 수 없습니다."
    };
  }

  if (bufferEndsAt <= sessionEndsAt) {
    return {
      status: "reject" as const,
      approvedEndsAt: null,
      message: "다음 예약 준비 시간이 필요해 연장할 수 없습니다."
    };
  }

  return {
    status: "partial" as const,
    approvedEndsAt: bufferEndsAt,
    message: "다음 예약 전 여유시간까지만 단축 연장되었습니다."
  };
}

export async function POST(request: NextRequest) {
  const supabase = createSupabaseAdminClient();
  const { agent, error: authError } = await getAgentByToken(supabase, request);

  if (!agent) {
    return NextResponse.json({ ok: false, message: authError ?? "Agent 인증에 실패했습니다." }, { status: 401 });
  }

  let body: ExtensionRequestBody;
  try {
    body = (await request.json()) as ExtensionRequestBody;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON 요청 본문을 확인해주세요." }, { status: 400 });
  }

  if (typeof body.accessSessionId !== "string" || body.accessSessionId.length === 0) {
    return NextResponse.json({ ok: false, message: "accessSessionId가 필요합니다." }, { status: 400 });
  }

  await touchAgent(supabase, agent, { agentVersion: request.headers.get("x-vista-agent-version") });

  const settings = await getStoreExtensionSettings(supabase, agent.store_id);
  const requestedMinutes = getRequestedMinutes(body, settings);
  const priceAmount = getPriceAmount(body, settings);

  const { data: sessionData, error: sessionError } = await supabase
    .from("access_sessions")
    .select("id, store_id, bay_id, reservation_id, status, started_at, ends_at")
    .eq("id", body.accessSessionId)
    .eq("store_id", agent.store_id)
    .eq("bay_id", agent.bay_id)
    .in("status", ["active", "extended"])
    .maybeSingle();

  if (sessionError) {
    return NextResponse.json({ ok: false, message: sessionError.message }, { status: 500 });
  }

  if (!sessionData) {
    return NextResponse.json({ ok: false, message: "진행 중인 이용 세션을 찾지 못했습니다." }, { status: 404 });
  }

  const session = sessionData as AccessSessionRow;
  if (!session.ends_at || !session.reservation_id) {
    return NextResponse.json({ ok: false, message: "연장 가능한 예약 세션이 아닙니다." }, { status: 409 });
  }

  const sessionEndsAt = new Date(session.ends_at);
  const requestedEndsAt = addMinutes(sessionEndsAt, requestedMinutes);

  const { data: createdRequest, error: requestError } = await supabase
    .from("extension_requests")
    .insert({
      store_id: agent.store_id,
      access_session_id: session.id,
      reservation_id: session.reservation_id,
      bay_id: agent.bay_id,
      requested_minutes: requestedMinutes,
      status: "requested",
      requested_ends_at: requestedEndsAt.toISOString(),
      price_amount: priceAmount,
      price_currency: "KRW",
      conflict_policy: settings.conflict_policy
    })
    .select("id")
    .single();

  if (requestError) {
    return NextResponse.json({ ok: false, message: requestError.message }, { status: 500 });
  }

  const requestId = createdRequest.id as string;

  if (settings.extension_mode === "manual") {
    return NextResponse.json({
      ok: true,
      status: "requested",
      message: "연장 요청이 접수되었습니다. 관리자 확인 후 적용됩니다.",
      extensionRequestId: requestId
    });
  }

  const { data: nextData, error: nextError } = await supabase
    .from("reservations")
    .select("id, starts_at")
    .eq("store_id", agent.store_id)
    .eq("bay_id", agent.bay_id)
    .neq("id", session.reservation_id)
    .not("status", "in", "(cancelled,no_show)")
    .gt("starts_at", sessionEndsAt.toISOString())
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (nextError) {
    return NextResponse.json({ ok: false, message: nextError.message }, { status: 500 });
  }

  const decision = getApprovalTarget(
    sessionEndsAt,
    requestedEndsAt,
    nextData ? (nextData as NextReservationRow) : null,
    settings
  );

  if (decision.status === "manual") {
    return NextResponse.json({
      ok: true,
      status: "requested",
      message: decision.message,
      extensionRequestId: requestId
    });
  }

  if (decision.status === "reject" || !decision.approvedEndsAt) {
    await supabase
      .from("extension_requests")
      .update({
        status: "rejected",
        decision_source: "auto",
        decided_at: new Date().toISOString(),
        approved_minutes: 0,
        memo: decision.message
      })
      .eq("id", requestId);

    return NextResponse.json({
      ok: true,
      status: "rejected",
      message: decision.message,
      extensionRequestId: requestId
    });
  }

  const approvedMinutes = Math.max(1, Math.floor((decision.approvedEndsAt.getTime() - sessionEndsAt.getTime()) / 60_000));

  const { error: reservationError } = await supabase
    .from("reservations")
    .update({ ends_at: decision.approvedEndsAt.toISOString() })
    .eq("id", session.reservation_id);

  if (reservationError) {
    await supabase
      .from("extension_requests")
      .update({
        status: "rejected",
        decision_source: "system",
        decided_at: new Date().toISOString(),
        approved_minutes: 0,
        memo: `예약 시간 연장 실패: ${reservationError.message}`
      })
      .eq("id", requestId);

    return NextResponse.json(
      {
        ok: false,
        status: "rejected",
        message: reservationError.code === "23P01" ? "다음 예약과 시간이 겹쳐 연장할 수 없습니다." : reservationError.message,
        extensionRequestId: requestId
      },
      { status: reservationError.code === "23P01" ? 409 : 500 }
    );
  }

  const { error: accessError } = await supabase
    .from("access_sessions")
    .update({ status: "extended", ends_at: decision.approvedEndsAt.toISOString() })
    .eq("id", session.id);

  if (accessError) {
    return NextResponse.json({ ok: false, message: accessError.message }, { status: 500 });
  }

  const { data: kioskSession } = await supabase
    .from("kiosk_sessions")
    .select("id, extended_minutes")
    .eq("access_session_id", session.id)
    .maybeSingle();

  if (kioskSession) {
    await supabase
      .from("kiosk_sessions")
      .update({
        extended_minutes: Number(kioskSession.extended_minutes ?? 0) + approvedMinutes,
        remaining_seconds: Math.max(0, Math.floor((decision.approvedEndsAt.getTime() - Date.now()) / 1000))
      })
      .eq("id", kioskSession.id);
  }

  await supabase
    .from("extension_requests")
    .update({
      status: "approved",
      decision_source: "auto",
      decided_at: new Date().toISOString(),
      approved_minutes: approvedMinutes,
      approved_ends_at: decision.approvedEndsAt.toISOString(),
      memo: decision.message
    })
    .eq("id", requestId);

  return NextResponse.json({
    ok: true,
    status: "approved",
    message: decision.message,
    extensionRequestId: requestId,
    approvedMinutes,
    approvedEndsAt: decision.approvedEndsAt.toISOString()
  });
}
