import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { runBayAutomation } from "@/lib/automation/sessions";
import { enqueueBayPreparation, isStoreControllerEnabled } from "@/lib/store-controller";
import { getBonusMinutesForDuration, getPriceForDuration } from "@/lib/reservation-policy";
import { findDurationOption, getStoreDurationOptions } from "@/lib/reservation-policy-server";

export const INACTIVE_RESERVATION_STATUSES = ["cancelled", "no_show", "completed"];

export type KioskBay = {
  id: string;
  bay_code: string;
  display_name: string;
  status: string;
};

// 키오스크 API 보호: KIOSK_ACCESS_KEY가 설정되어 있으면 요청 헤더와
// 일치해야 한다. 개발 환경에서만 미설정 통과를 허용한다.
export function checkKioskKey(request: NextRequest): boolean {
  const expected = process.env.KIOSK_ACCESS_KEY;
  if (!expected) return process.env.NODE_ENV !== "production";

  return request.headers.get("x-kiosk-key") === expected;
}

// Asia/Seoul 기준 오늘 하루의 UTC 경계
export function getSeoulDayRange(now = new Date()) {
  const dateValue = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
  const [year, month, day] = dateValue.split("-").map(Number);

  return {
    start: new Date(Date.UTC(year, month - 1, day, -9)),
    end: new Date(Date.UTC(year, month - 1, day + 1, -9))
  };
}

// 주어진 시간 구간에 겹치는 활성 예약이 없는 타석 목록 (bay_code 순)
export async function findFreeBays(
  supabase: SupabaseClient,
  storeId: string,
  startsAt: Date,
  endsAt: Date
): Promise<KioskBay[]> {
  const { data: bays, error: bayError } = await supabase
    .from("bays")
    .select("id, bay_code, display_name, status")
    .eq("store_id", storeId)
    .in("status", ["available", "waiting"])
    .order("bay_code", { ascending: true });

  if (bayError) throw new Error(bayError.message);
  if (!bays || bays.length === 0) return [];

  const { data: overlapping, error: overlapError } = await supabase
    .from("reservations")
    .select("bay_id")
    .eq("store_id", storeId)
    .not("status", "in", `(${INACTIVE_RESERVATION_STATUSES.join(",")})`)
    .lt("starts_at", endsAt.toISOString())
    .gt("ends_at", startsAt.toISOString());

  if (overlapError) throw new Error(overlapError.message);

  const blocked = new Set((overlapping ?? []).map((row) => row.bay_id).filter(Boolean));

  return (bays as KioskBay[]).filter((bay) => !blocked.has(bay.id));
}

export type BayAvailability = KioskBay & { isFree: boolean };

// 매장의 모든 타석을 배치도 표시용으로 반환한다. 각 타석이 주어진 시간
// 구간에 이용 가능한지(isFree)를 함께 계산한다. findFreeBays와 달리
// in_use/maintenance 타석도 포함하므로 키오스크가 3자리를 항상 그릴 수 있다.
export async function listBaysWithAvailability(
  supabase: SupabaseClient,
  storeId: string,
  startsAt: Date,
  endsAt: Date
): Promise<BayAvailability[]> {
  // 두 조회는 서로를 필요로 하지 않는다. 키오스크 첫 화면 응답 속도에 직접
  // 영향을 주는 경로라 왕복 한 번을 줄이려고 함께 보낸다.
  const [bayResult, overlapResult] = await Promise.all([
    supabase
      .from("bays")
      .select("id, bay_code, display_name, status")
      .eq("store_id", storeId)
      .order("bay_code", { ascending: true }),
    supabase
      .from("reservations")
      .select("bay_id")
      .eq("store_id", storeId)
      .not("status", "in", `(${INACTIVE_RESERVATION_STATUSES.join(",")})`)
      .lt("starts_at", endsAt.toISOString())
      .gt("ends_at", startsAt.toISOString())
  ]);

  const { data: bays, error: bayError } = bayResult;
  const { data: overlapping, error: overlapError } = overlapResult;

  if (bayError) throw new Error(bayError.message);
  if (!bays || bays.length === 0) return [];
  if (overlapError) throw new Error(overlapError.message);

  const blocked = new Set((overlapping ?? []).map((row) => row.bay_id).filter(Boolean));

  return (bays as KioskBay[]).map((bay) => ({
    ...bay,
    isFree: (bay.status === "available" || bay.status === "waiting") && !blocked.has(bay.id)
  }));
}

export type StartKioskSessionArgs = {
  supabase: SupabaseClient;
  storeId: string;
  bayId: string;
  reservationId: string;
  guestName: string | null;
  partySize: number;
  startsAt: Date;
  endsAt: Date;
};

export type StartKioskSessionResult = {
  accessSessionId: string;
  kioskSessionId: string | null;
  automationStatus: "requested" | "failed" | "skipped";
  automationDetail: string | null;
};

export type StartWalkInSessionArgs = {
  supabase: SupabaseClient;
  storeId: string;
  durationMinutes: number;
  partySize?: number;
  bayId?: string | null;
  guestName?: string | null;
  memoPrefix?: string;
  /** 같은 입장 요청이 두 번 들어와도 한 번만 처리되도록 하는 요청번호 */
  requestId?: string | null;
};

export type StartWalkInSessionResult = {
  bayId: string;
  bayCode: string;
  startsAt: Date;
  endsAt: Date;
  durationMinutes: number;
  price: number;
  reservationId: string;
  accessSessionId: string;
  automationStatus: StartKioskSessionResult["automationStatus"];
  automationDetail: string | null;
};

type ExistingActiveSession = {
  id: string;
  bay_id: string | null;
  ends_at: string | null;
};

async function findExistingActiveSession(supabase: SupabaseClient, reservationId: string) {
  const { data, error } = await supabase
    .from("access_sessions")
    .select("id, bay_id, ends_at")
    .eq("reservation_id", reservationId)
    .in("status", ["active", "extended"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return (data as ExistingActiveSession | null) ?? null;
}

async function findKioskSessionId(supabase: SupabaseClient, accessSessionId: string) {
  const { data, error } = await supabase
    .from("kiosk_sessions")
    .select("id")
    .eq("access_session_id", accessSessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;

  return data?.id ?? null;
}

// 이미 처리된 현장 이용 요청을 요청번호로 찾아 같은 응답을 재구성한다.
// walk_in_request_id 컬럼이 없는 환경(마이그레이션 미적용)에서는 조용히 건너뛴다.
async function findWalkInByRequestId(
  supabase: SupabaseClient,
  requestId: string
): Promise<StartWalkInSessionResult | null> {
  const { data, error } = await supabase
    .from("reservations")
    .select("id, bay_id, starts_at, ends_at, party_size, bays(bay_code)")
    .eq("walk_in_request_id", requestId)
    .maybeSingle();

  if (error || !data?.bay_id) return null;

  const { data: session } = await supabase
    .from("access_sessions")
    .select("id")
    .eq("reservation_id", data.id)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session?.id) return null;

  const bay = Array.isArray(data.bays) ? data.bays[0] : data.bays;
  const startsAt = new Date(data.starts_at as string);
  const endsAt = new Date(data.ends_at as string);
  const durationMinutes = Math.max(1, Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000));

  return {
    bayId: data.bay_id as string,
    bayCode: (bay as { bay_code?: string } | null)?.bay_code ?? "",
    startsAt,
    endsAt,
    durationMinutes,
    price: 0,
    reservationId: data.id as string,
    accessSessionId: session.id as string,
    automationStatus: "skipped",
    automationDetail: "이미 접수된 입장 요청입니다."
  };
}

async function rollbackCreatedAccessSession(supabase: SupabaseClient, accessSessionId: string, originalError: string) {
  const { error: rollbackError } = await supabase.from("access_sessions").delete().eq("id", accessSessionId);

  if (rollbackError) {
    throw new Error(`${originalError} (입장 세션 정리 실패: ${rollbackError.message})`);
  }

  throw new Error(originalError);
}

// 입장 확정 후 공통 처리: access_session 생성 → kiosk_session 생성 →
// 타석 in_use → Home Assistant 자동화 호출.
// 자동화 실패는 입장 자체를 막지 않는다 (장비는 매장에서 수동 대응 가능).
export async function startKioskSession(args: StartKioskSessionArgs): Promise<StartKioskSessionResult> {
  const now = new Date();
  const allowedMinutes = Math.max(1, Math.round((args.endsAt.getTime() - args.startsAt.getTime()) / 60_000));
  const remainingSeconds = Math.max(0, Math.floor((args.endsAt.getTime() - now.getTime()) / 1000));
  const existingSession = await findExistingActiveSession(args.supabase, args.reservationId);

  if (existingSession) {
    if (existingSession.bay_id) {
      await args.supabase
        .from("bays")
        .update({ status: "in_use", updated_at: now.toISOString() })
        .eq("id", existingSession.bay_id);
    }

    return {
      accessSessionId: existingSession.id,
      kioskSessionId: await findKioskSessionId(args.supabase, existingSession.id),
      automationStatus: "skipped",
      automationDetail: "이미 입장 처리된 세션을 다시 사용했습니다."
    };
  }

  const { data: accessSession, error: accessError } = await args.supabase
    .from("access_sessions")
    .insert({
      store_id: args.storeId,
      reservation_id: args.reservationId,
      bay_id: args.bayId,
      guest_name: args.guestName,
      party_size: args.partySize,
      status: "active",
      started_at: now.toISOString(),
      ends_at: args.endsAt.toISOString(),
      entry_method: "kiosk"
    })
    .select("id")
    .single();

  if (accessError) {
    if (accessError.code === "23505") {
      const racedSession = await findExistingActiveSession(args.supabase, args.reservationId);
      if (racedSession) {
        return {
          accessSessionId: racedSession.id,
          kioskSessionId: await findKioskSessionId(args.supabase, racedSession.id),
          automationStatus: "skipped",
          automationDetail: "동시에 처리된 입장 세션을 다시 사용했습니다."
        };
      }
    }

    throw new Error(accessError.message);
  }

  const { data: kioskSession, error: kioskError } = await args.supabase
    .from("kiosk_sessions")
    .insert({
      access_session_id: accessSession.id,
      allowed_minutes: allowedMinutes,
      remaining_seconds: remainingSeconds
    })
    .select("id")
    .single();

  if (kioskError || !kioskSession) {
    await rollbackCreatedAccessSession(
      args.supabase,
      accessSession.id,
      kioskError?.message ?? "키오스크 이용 세션을 생성하지 못했습니다."
    );
  }

  const { error: bayUpdateError } = await args.supabase
    .from("bays")
    .update({ status: "in_use", updated_at: now.toISOString() })
    .eq("id", args.bayId);

  if (bayUpdateError) {
    await rollbackCreatedAccessSession(args.supabase, accessSession.id, bayUpdateError.message);
  }

  let automationStatus: StartKioskSessionResult["automationStatus"] = "skipped";
  let automationDetail: string | null = null;

  try {
    if (isStoreControllerEnabled()) {
      const queued = await enqueueBayPreparation(args.supabase, {
        bayId: args.bayId,
        accessSessionId: accessSession.id,
        reservationId: args.reservationId
      });
      automationStatus = queued.status === "failed" ? "failed" : "requested";
      automationDetail = queued.reused
        ? "기존 장비 준비 요청을 이어서 처리합니다."
        : "매장 장비 준비 요청을 접수했습니다.";
    } else {
    const automation = await runBayAutomation({
      supabase: args.supabase,
      bayId: args.bayId,
      action: "enter",
      accessSessionId: accessSession.id,
      reservationId: args.reservationId
    });
    automationStatus = automation.steps.every((step) => step.ok) ? "requested" : "failed";
    automationDetail = automation.steps.map((step) => `${step.name}: ${step.ok ? "성공" : "실패"}`).join(", ");
    }
  } catch (error) {
    automationStatus = "failed";
    automationDetail = error instanceof Error ? error.message : "자동화 호출 실패";
  }

  return {
    accessSessionId: accessSession.id,
    kioskSessionId: kioskSession!.id,
    automationStatus,
    automationDetail
  };
}

export async function startWalkInSession(args: StartWalkInSessionArgs): Promise<StartWalkInSessionResult> {
  const startsAt = new Date();
  // 요금·서비스 시간은 관리자 요금설정(store_settings.duration_options)을 우선한다.
  // 관리자 수동 입장처럼 요금표에 없는 시간은 시간 비례로 계산한다.
  const storeOptions = await getStoreDurationOptions(args.storeId, args.supabase);
  const matched = findDurationOption(storeOptions, args.durationMinutes);
  const bonusMinutes = matched ? matched.bonusMinutes : getBonusMinutesForDuration(args.durationMinutes);
  const price = matched ? matched.price : getPriceForDuration(args.durationMinutes);
  const endsAt = new Date(startsAt.getTime() + (args.durationMinutes + bonusMinutes) * 60_000);
  const partySize = args.partySize ?? 1;
  const guestName = args.guestName?.trim() || "현장 고객";
  const memoPrefix = args.memoPrefix?.trim() || "현장 이용";

  // 같은 요청번호가 다시 오면 새로 만들지 않고 이미 처리된 결과를 돌려준다.
  // (더블탭, 네트워크 재전송 등으로 같은 입장이 두 번 접수되는 것을 막는다)
  if (args.requestId) {
    const already = await findWalkInByRequestId(args.supabase, args.requestId);
    if (already) return already;
  }

  const freeBays = await findFreeBays(args.supabase, args.storeId, startsAt, endsAt);

  if (freeBays.length === 0) {
    throw new Error("현재 이용 가능한 타석이 없습니다. 잠시 후 다시 시도해주세요.");
  }

  if (args.bayId) {
    const chosen = freeBays.find((bay) => bay.id === args.bayId);
    if (!chosen) {
      const error = new Error("선택하신 타석이 방금 사용 중으로 바뀌었습니다. 다른 타석을 선택해주세요.");
      error.name = "BayUnavailableError";
      throw error;
    }
  }

  const candidates = args.bayId ? freeBays.filter((bay) => bay.id === args.bayId) : freeBays.slice(0, 3);
  let reservationId: string | null = null;
  let assignedBay: (typeof freeBays)[number] | null = null;

  for (const bay of candidates) {
    const baseRow = {
      store_id: args.storeId,
      bay_id: bay.id,
      guest_name: guestName,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      party_size: partySize,
      channel: "walk_in",
      status: "checked_in",
      approval_required: false,
      memo: `${memoPrefix} · 후불 계좌이체 · 미결제 ${price.toLocaleString("ko-KR")}원`
    };

    const insertRow: Record<string, unknown> = args.requestId
      ? { ...baseRow, walk_in_request_id: args.requestId }
      : { ...baseRow };

    let { data: inserted, error: insertError } = await args.supabase
      .from("reservations")
      .insert(insertRow)
      .select("id")
      .single();

    // walk_in_request_id 컬럼이 아직 없는 환경(마이그레이션 미적용)에서도
    // 입장 자체는 되어야 한다. 중복 방지 없이 한 번 더 시도한다.
    if (insertError && /walk_in_request_id/i.test(insertError.message)) {
      ({ data: inserted, error: insertError } = await args.supabase
        .from("reservations")
        .insert(baseRow)
        .select("id")
        .single());
    }

    if (!insertError && inserted) {
      reservationId = inserted.id;
      assignedBay = bay;
      break;
    }

    // 같은 요청번호가 거의 동시에 두 번 들어온 경우. 먼저 처리된 결과를 돌려준다.
    if (insertError?.code === "23505" && args.requestId) {
      const already = await findWalkInByRequestId(args.supabase, args.requestId);
      if (already) return already;
    }

    if (insertError && insertError.code !== "23P01" && insertError.code !== "23505") {
      throw new Error(insertError.message);
    }
  }

  if (!reservationId || !assignedBay) {
    const error = new Error(
      args.bayId
        ? "선택하신 타석이 방금 마감되었습니다. 다른 타석을 선택해주세요."
        : "방금 다른 이용이 시작되어 타석이 마감되었습니다. 다시 시도해주세요."
    );
    error.name = "BayUnavailableError";
    throw error;
  }

  let session: StartKioskSessionResult;

  try {
    session = await startKioskSession({
      supabase: args.supabase,
      storeId: args.storeId,
      bayId: assignedBay.id,
      reservationId,
      guestName,
      partySize,
      startsAt,
      endsAt
    });
  } catch (sessionError) {
    const { error: reservationCleanupError } = await args.supabase.from("reservations").delete().eq("id", reservationId);

    if (reservationCleanupError) {
      const message = sessionError instanceof Error ? sessionError.message : "입장 세션 생성 실패";
      throw new Error(`${message} (현장 예약 정리 실패: ${reservationCleanupError.message})`);
    }

    throw sessionError;
  }

  return {
    bayId: assignedBay.id,
    bayCode: assignedBay.bay_code,
    startsAt,
    endsAt,
    durationMinutes: args.durationMinutes,
    price,
    reservationId,
    accessSessionId: session.accessSessionId,
    automationStatus: session.automationStatus,
    automationDetail: session.automationDetail
  };
}
