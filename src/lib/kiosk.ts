import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { runBayAutomation } from "@/lib/automation/sessions";

export const INACTIVE_RESERVATION_STATUSES = ["cancelled", "no_show"];

export type KioskBay = {
  id: string;
  bay_code: string;
  display_name: string;
  status: string;
};

// 키오스크 API 보호: KIOSK_ACCESS_KEY가 설정되어 있으면 요청 헤더와
// 일치해야 한다. 미설정이면 개발 편의를 위해 통과시킨다.
export function checkKioskKey(request: NextRequest): boolean {
  const expected = process.env.KIOSK_ACCESS_KEY;
  if (!expected) return true;

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
  const { data: bays, error: bayError } = await supabase
    .from("bays")
    .select("id, bay_code, display_name, status")
    .eq("store_id", storeId)
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

// 입장 확정 후 공통 처리: access_session 생성 → kiosk_session 생성 →
// 타석 in_use → Home Assistant 자동화 호출.
// 자동화 실패는 입장 자체를 막지 않는다 (장비는 매장에서 수동 대응 가능).
export async function startKioskSession(args: StartKioskSessionArgs): Promise<StartKioskSessionResult> {
  const now = new Date();
  const allowedMinutes = Math.max(1, Math.round((args.endsAt.getTime() - args.startsAt.getTime()) / 60_000));
  const remainingSeconds = Math.max(0, Math.floor((args.endsAt.getTime() - now.getTime()) / 1000));

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

  if (accessError) throw new Error(accessError.message);

  const { data: kioskSession, error: kioskError } = await args.supabase
    .from("kiosk_sessions")
    .insert({
      access_session_id: accessSession.id,
      allowed_minutes: allowedMinutes,
      remaining_seconds: remainingSeconds
    })
    .select("id")
    .single();

  const { error: bayUpdateError } = await args.supabase
    .from("bays")
    .update({ status: "in_use", updated_at: now.toISOString() })
    .eq("id", args.bayId);

  if (bayUpdateError) throw new Error(bayUpdateError.message);

  let automationStatus: StartKioskSessionResult["automationStatus"] = "skipped";
  let automationDetail: string | null = null;

  try {
    const automation = await runBayAutomation({
      supabase: args.supabase,
      bayId: args.bayId,
      action: "enter",
      accessSessionId: accessSession.id,
      reservationId: args.reservationId
    });
    automationStatus = automation.steps.every((step) => step.ok) ? "requested" : "failed";
    automationDetail = automation.steps.map((step) => `${step.name}: ${step.ok ? "성공" : "실패"}`).join(", ");
  } catch (error) {
    automationStatus = "failed";
    automationDetail = error instanceof Error ? error.message : "자동화 호출 실패";
  }

  return {
    accessSessionId: accessSession.id,
    kioskSessionId: kioskError ? null : kioskSession.id,
    automationStatus,
    automationDetail
  };
}
