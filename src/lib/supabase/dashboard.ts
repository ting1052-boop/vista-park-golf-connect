import type { AdminAlert, NoShowRow } from "@/lib/dashboard-data";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type DashboardReservationSummary = {
  total: number;
  app: number;
  walkInPhone: number;
};

export type DashboardReservationRow = {
  id: string;
  time: string;
  member: string;
  bay: string;
  channel: string;
  approval: string;
  status: string;
};

export type DashboardOperationalRows = {
  reservations: DashboardReservationRow[];
  alerts: AdminAlert[];
  noShows: NoShowRow[];
  todaySummary: DashboardReservationSummary;
};

type ReservationRecord = {
  id: string;
  starts_at: string;
  ends_at: string;
  party_size: number | null;
  channel: string | null;
  status: string | null;
  approval_required: boolean | null;
  guest_name: string | null;
  guest_phone_last4: string | null;
  bays:
    | {
        bay_code: string | null;
        display_name: string | null;
      }
    | Array<{
        bay_code: string | null;
        display_name: string | null;
      }>
    | null;
};

function getKstTodayRange(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  const year = get("year");
  const month = get("month");
  const day = get("day");

  if (!year || !month || !day) {
    throw new Error("오늘 날짜를 계산하지 못했습니다.");
  }

  const start = new Date(`${year}-${month}-${day}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function formatKstTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function getBayLabel(row: ReservationRecord) {
  const bay = Array.isArray(row.bays) ? row.bays[0] : row.bays;
  return bay?.bay_code ?? bay?.display_name ?? "미배정";
}

function getChannelLabel(channel: string | null) {
  if (channel === "member_app") return "앱 예약";
  if (channel === "walk_in") return "현장 이용";
  if (channel === "phone") return "전화 예약";
  return "관리자 등록";
}

function getStatusLabel(status: string | null) {
  if (status === "confirmed") return "확정";
  if (status === "checked_in") return "입장 완료";
  if (status === "completed") return "이용 완료";
  if (status === "cancelled") return "취소";
  if (status === "no_show") return "노쇼";
  return "승인 대기";
}

function getGuestLabel(row: ReservationRecord) {
  if (!row.guest_name && !row.guest_phone_last4) {
    return row.party_size ? `${row.party_size}명 예약` : "예약 고객";
  }

  return `${row.guest_name ?? "예약 고객"} / ****-${row.guest_phone_last4 ?? "----"}`;
}

function mapReservation(row: ReservationRecord): DashboardReservationRow {
  return {
    id: row.id,
    time: formatKstTime(row.starts_at),
    member: getGuestLabel(row),
    bay: getBayLabel(row),
    channel: getChannelLabel(row.channel),
    approval: row.approval_required ? "관리자 승인" : "자동 확정",
    status: getStatusLabel(row.status)
  };
}

function buildAlerts(rows: ReservationRecord[]): AdminAlert[] {
  return rows
    .filter((row) => row.status === "requested" || row.approval_required)
    .map((row) => ({
      id: `reservation-alert-${row.id}`,
      title: `${formatKstTime(row.starts_at)} 예약 승인 확인`,
      description: `${getGuestLabel(row)} / ${getBayLabel(row)} / ${row.approval_required ? "관리자 승인 필요" : "예약 상태 확인 필요"}`,
      tone: "warning"
    }));
}

function buildNoShows(rows: ReservationRecord[]): NoShowRow[] {
  return rows
    .filter((row) => row.status === "no_show")
    .map((row) => ({
      id: `noshow-${row.id}`,
      time: formatKstTime(row.starts_at),
      member: getGuestLabel(row),
      bay: getBayLabel(row),
      action: "노쇼 처리된 예약"
    }));
}

export async function getDashboardOperationalRows(storeId: string): Promise<DashboardOperationalRows> {
  const supabase = createSupabaseAdminClient();
  const { startIso, endIso } = getKstTodayRange();

  const { data, error } = await supabase
    .from("reservations")
    .select(
      "id, starts_at, ends_at, party_size, channel, status, approval_required, guest_name, guest_phone_last4, bays(bay_code, display_name)"
    )
    .eq("store_id", storeId)
    .gte("starts_at", startIso)
    .lt("starts_at", endIso)
    .order("starts_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const rows = ((data ?? []) as ReservationRecord[]).filter((row) => row.status !== "cancelled");
  const activeRows = rows.filter((row) => row.status !== "completed");
  const app = rows.filter((row) => row.channel === "member_app").length;
  const walkInPhone = rows.filter((row) => row.channel === "walk_in" || row.channel === "phone").length;

  return {
    reservations: activeRows.map(mapReservation),
    alerts: buildAlerts(activeRows),
    noShows: buildNoShows(rows),
    todaySummary: {
      total: rows.length,
      app,
      walkInPhone
    }
  };
}
