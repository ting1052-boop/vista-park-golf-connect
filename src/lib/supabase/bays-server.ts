import type { LiveBay } from "@/lib/dashboard-data";
import { getBays } from "@/lib/supabase/bays";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type ActiveSessionRow = {
  id: string;
  bay_id: string | null;
  guest_name: string | null;
  party_size: number | null;
  started_at: string | null;
  ends_at: string | null;
  status: string;
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

  return {
    ...bay,
    status: "in_use",
    mode: session.status === "overdue" ? "이용 시간 초과" : "이용 중",
    customer: getSessionCustomerLabel(session),
    people: session.party_size ?? undefined,
    totalMinutes,
    remainingMinutes,
    startedAt: formatKstTime(session.started_at),
    endsAt: formatKstTime(session.ends_at),
    note: session.status === "overdue" ? "종료 시간이 지난 세션입니다." : "타석 이용 세션 진행 중"
  };
}

export async function getDashboardBays(storeId: string): Promise<LiveBay[]> {
  const [bays, sessionResult] = await Promise.all([
    getBays(storeId),
    createSupabaseAdminClient()
      .from("access_sessions")
      .select("id, bay_id, guest_name, party_size, started_at, ends_at, status, reservations(guest_name, guest_phone_last4)")
      .eq("store_id", storeId)
      .in("status", ACTIVE_SESSION_STATUSES)
      .not("bay_id", "is", null)
      .order("started_at", { ascending: false })
  ]);

  if (sessionResult.error) {
    throw new Error(sessionResult.error.message);
  }

  const now = new Date();
  const sessionsByBayId = new Map<string, ActiveSessionRow>();

  for (const session of (sessionResult.data ?? []) as unknown as ActiveSessionRow[]) {
    if (session.bay_id && !sessionsByBayId.has(session.bay_id)) {
      sessionsByBayId.set(session.bay_id, session);
    }
  }

  return bays.map((bay) => {
    const session = sessionsByBayId.get(bay.id);
    return session ? applySessionToBay(bay, session, now) : bay;
  });
}
