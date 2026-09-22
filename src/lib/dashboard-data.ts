import type { GameTelemetry } from "@/lib/game-telemetry";

export type LiveBayStatus = "in_use" | "available" | "waiting" | "maintenance";
export type LogTone = "success" | "control" | "warning" | "danger";
export type AlertTone = "danger" | "warning";

export type LiveBay = {
  id: string;
  name: string;
  zone: string;
  status: LiveBayStatus;
  accessSessionId?: string;
  reservationId?: string;
  sessionStatus?: "active" | "extended" | "overdue";
  entryMethod?: string;
  customer?: string;
  reservationName?: string;
  people?: number;
  totalMinutes?: number;
  remainingMinutes?: number;
  startedAt?: string;
  endsAt?: string;
  startedAtIso?: string;
  endsAtIso?: string;
  nextReservation?: string;
  mode: string;
  note: string;
  pcOnline?: boolean;
  pcLastSeenIso?: string;
  gameTelemetry?: GameTelemetry;
  gameTelemetryReceivedAt?: string;
  gameTelemetryStale?: boolean;
  agentVersion?: string;
  gameActivity?: GameActivitySummary;
};

export type GameRoundEventSummary = {
  eventId: string;
  occurredAt: string;
  courseId?: string;
  lastKnownHole?: number;
  receivedAt: string;
  delayed: boolean;
};

export type GameActivitySummary = {
  supported: boolean;
  todayReturnedToLobby?: number;
  recentEvents: GameRoundEventSummary[];
};

export type ControlLog = {
  id: string;
  time: string;
  target: string;
  event: string;
  result: string;
  tone: LogTone;
};

export type AdminAlert = {
  id: string;
  title: string;
  description: string;
  tone: AlertTone;
};

export type NoShowRow = {
  id: string;
  time: string;
  member: string;
  bay: string;
  action: string;
};

export const adminNavItems = [
  { label: "대시보드", href: "/admin/dashboard", active: true },
  { label: "예약관리", href: "/admin/reservations", active: false },
  { label: "미수금", href: "/admin/unpaid", active: false },
  { label: "무인제어", href: "/admin/automation", active: false },
  { label: "원격접속", href: "/admin/remote-access", active: false },
  { label: "요금설정", href: "/admin/pricing", active: false },
  { label: "매장관리", href: "/admin/stores", active: false },
  { label: "타석관리", href: "/admin/bays", active: false },
  { label: "장비관리", href: "/admin/devices", active: false },
  { label: "회원관리", href: "/admin/members", active: false },
  { label: "조인모집", href: "/admin/join", active: false },
  { label: "리포트", href: "/admin/reports", active: false }
] as const;

export function getAdminNavItems(limitedMenu: boolean) {
  if (!limitedMenu) return adminNavItems;
  return adminNavItems.filter((item) => item.href === "/admin/dashboard" || item.href === "/admin/automation");
}
