import type { LiveBay } from "@/lib/dashboard-data";
import { getBays } from "@/lib/supabase/bays";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { closeSingleSession } from "@/lib/session-cleanup";

// 마지막 하트비트가 이 시간 안이면 PC가 켜진 것으로 본다(에이전트는 약 15초마다 신호).
const PC_ONLINE_THRESHOLD_MS = 120_000;
// 종료시각이 지난 뒤 이 시간이 더 지나도록 방치된(에이전트/크론이 못 닫은) 세션만
// 대시보드 조회 시 자동 정리한다. 정상 종료 흐름(에이전트 5분 대기)과 겹치지 않게 여유를 둔다.
const SELF_HEAL_GRACE_MS = 10 * 60_000;

type AgentDeviceRow = { bay_id: string | null; last_seen_at: string | null; is_active: boolean | null };

type ActiveSessionRow = {
  id: string;
  bay_id: string | null;
  reservation_id: string | null;
  guest_name: string | null;
  party_size: number | null;
  started_at: string | null;
  ends_at: string | null;
  status: string;
  entry_method: string | null;
  reservations?: { guest_name: string | null; guest_phone_last4: string | null } | { guest_name: string | null; guest_phone_last4: string | null }[] | null;
};

const ACTIVE_SESSION_STATUSES = ["active", "extended", "overdue"];

function formatKstTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul"
  }).format(new Date(value));
}

function minutesBetween(start: Date, end: Date) {
  return Math.max(0, Math.ceil((end.getTime() - start.getTime()) / 60000));
}

function getSessionCustomerLabel(session: ActiveSessionRow) {
  const reservation = Array.isArray(session.reservations) ? session.reservations[0] : session.reservations;
  const reservationName = reservation?.guest_name;
  const guestName = session.guest_name;

  return reservationName || guestName || "현장 고객";
}

function applySessionToBay(bay: LiveBay, session: ActiveSessionRow, now: Date): LiveBay {
  const startedAt = session.started_at ? new Date(session.started_at) : null;
  const endsAt = session.ends_at ? new Date(session.ends_at) : null;
  const totalMinutes = startedAt && endsAt ? minutesBetween(startedAt, endsAt) : undefined;
  const remainingMinutes = endsAt ? Math.ceil((endsAt.getTime() - now.getTime()) / 60000) : undefined;
  const normalizedSessionStatus =
    session.status === "overdue" || (remainingMinutes ?? 1) <= 0
      ? "overdue"
      : session.status === "extended"
        ? "extended"
        : "active";

  return {
    ...bay,
    status: "in_use",
    accessSessionId: session.id,
    reservationId: session.reservation_id ?? undefined,
    sessionStatus: normalizedSessionStatus,
    entryMethod: session.entry_method ?? undefined,
    mode: session.status === "overdue" || (remainingMinutes ?? 1) <= 0 ? "종료 확인 필요" : "이용 중",
    customer: getSessionCustomerLabel(session),
    people: session.party_size ?? undefined,
    totalMinutes,
    remainingMinutes,
    startedAt: formatKstTime(session.started_at),
    endsAt: formatKstTime(session.ends_at),
    startedAtIso: session.started_at ?? undefined,
    endsAtIso: session.ends_at ?? undefined,
    note:
      session.status === "overdue" || (remainingMinutes ?? 1) <= 0
        ? "종료 시간이 지났지만 종료되지 않은 세션입니다."
        : "타석 이용 세션 진행 중"
  };
}

function clearStaleInUseBay(bay: LiveBay): LiveBay {
  if (bay.status !== "in_use") {
    return bay;
  }

  return {
    ...bay,
    status: "available",
    accessSessionId: undefined,
    reservationId: undefined,
    sessionStatus: undefined,
    entryMethod: undefined,
    customer: undefined,
    people: undefined,
    totalMinutes: undefined,
    remainingMinutes: undefined,
    startedAt: undefined,
    endsAt: undefined,
    startedAtIso: undefined,
    endsAtIso: undefined,
    nextReservation: bay.nextReservation ?? "예약 배정 가능",
    mode: "즉시 배정 가능",
    note: "활성 입장 세션이 없어 사용 가능 상태로 표시합니다."
  };
}

export async function getDashboardBays(storeId: string): Promise<LiveBay[]> {
  const admin = createSupabaseAdminClient();
  const [bays, sessionResult, agentResult] = await Promise.all([
    getBays(storeId),
    admin
      .from("access_sessions")
      .select(
        "id, bay_id, reservation_id, guest_name, party_size, started_at, ends_at, status, entry_method, reservations(guest_name, guest_phone_last4)"
      )
      .eq("store_id", storeId)
      .in("status", ACTIVE_SESSION_STATUSES)
      .not("bay_id", "is", null)
      .order("started_at", { ascending: false }),
    admin.from("agent_devices").select("bay_id, last_seen_at, is_active").eq("store_id", storeId)
  ]);

  if (sessionResult.error) {
    throw new Error(sessionResult.error.message);
  }

  const now = new Date();

  // 각 타석 PC 온라인 여부 (agent_devices.last_seen_at 기준). 같은 타석에 여러 기기면 하나라도 켜져 있으면 온라인.
  const pcByBayId = new Map<string, { online: boolean; lastSeenIso?: string }>();
  for (const dev of (agentResult.data ?? []) as AgentDeviceRow[]) {
    if (!dev.bay_id) continue;
    const lastMs = dev.last_seen_at ? new Date(dev.last_seen_at).getTime() : 0;
    const online = dev.is_active !== false && lastMs > 0 && now.getTime() - lastMs <= PC_ONLINE_THRESHOLD_MS;
    const prev = pcByBayId.get(dev.bay_id);
    pcByBayId.set(dev.bay_id, {
      online: (prev?.online ?? false) || online,
      lastSeenIso: dev.last_seen_at ?? prev?.lastSeenIso
    });
  }

  const sessionsByBayId = new Map<string, ActiveSessionRow>();
  for (const session of (sessionResult.data ?? []) as unknown as ActiveSessionRow[]) {
    if (session.bay_id && !sessionsByBayId.has(session.bay_id)) {
      sessionsByBayId.set(session.bay_id, session);
    }
  }

  // 오래 방치된 만료 세션(미퇴장) 자동 정리: 종료시각 + 여유시간이 지났는데도 안 닫힌 세션만
  // DB 상으로 종료 처리(장비 OFF 자동화는 크론/에이전트가 담당하도록 runAutomation:false).
  const stuckSessions = [...sessionsByBayId.values()].filter(
    (s) => s.ends_at && now.getTime() - new Date(s.ends_at).getTime() >= SELF_HEAL_GRACE_MS
  );
  if (stuckSessions.length > 0) {
    await Promise.all(
      stuckSessions.map(async (s) => {
        try {
          await closeSingleSession(
            admin,
            { id: s.id, store_id: storeId, reservation_id: s.reservation_id, bay_id: s.bay_id, ends_at: s.ends_at },
            now.toISOString(),
            { runAutomation: false }
          );
          if (s.bay_id) sessionsByBayId.delete(s.bay_id);
        } catch {
          // 자동 정리 실패는 화면 표시를 막지 않는다(다음 조회/크론에서 재시도).
        }
      })
    );
  }

  return bays.map((bay) => {
    const session = sessionsByBayId.get(bay.id);
    const base = session ? applySessionToBay(bay, session, now) : clearStaleInUseBay(bay);
    const pc = pcByBayId.get(bay.id);
    return { ...base, pcOnline: pc?.online ?? false, pcLastSeenIso: pc?.lastSeenIso };
  });
}
