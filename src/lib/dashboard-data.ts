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
  { label: "매장관리", href: "/admin/stores", active: false },
  { label: "타석관리", href: "/admin/bays", active: false },
  { label: "장비관리", href: "/admin/devices", active: false },
  { label: "회원관리", href: "/admin/members", active: false },
  { label: "경기기록", href: "/admin/games", active: false },
  { label: "랭킹", href: "/admin/rankings", active: false },
  { label: "대회운영", href: "/admin/tournaments", active: false },
  { label: "조인모집", href: "/admin/join", active: false },
  { label: "리포트", href: "/admin/reports", active: false }
] as const;

export const featureChecks = [
  ["입장 인증", "예약 QR 또는 전화번호로 고객 확인 후 키오스크 세션 시작"],
  ["헤이홈/Tapo 연동 구조", "조명, 냉난방, 키오스크, 타석 전원 중심으로 1차 구성"],
  ["예약 입장", "예약 10분 전 조명/냉난방/키오스크 준비"],
  ["무예약 입장", "현장 키오스크 인증 후 관리자 승인 또는 자동 시간 부여"],
  ["인원별 이용시간", "인원수 또는 업주 지정 시간 기준으로 세션 부여"],
  ["종료 자동화", "세션 종료 후 키오스크 잠금, 조명/냉난방/타석 전원 OFF"],
  ["긴급 제어", "관리자 수동 ON/OFF, 키오스크 강제 종료"],
  ["제어 로그", "전원 제어, 실패, 재시도, 연장, 종료 기록"],
  ["출입문 제어", "1차 제외, 안전 검토 후 2차 기능으로 전환 가능"],
  ["게임·결제 연동", "1차 제외, 추후 키오스크/결제/스코어 연동 가능 구조"]
] as const;
