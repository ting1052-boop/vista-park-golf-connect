import {
  Activity,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileText,
  Lightbulb,
  MapPin,
  MonitorCog,
  Power,
  Smartphone,
  Snowflake,
  Timer,
  Users,
  Wrench
} from "lucide-react";

export type LiveBayStatus = "in_use" | "available" | "waiting" | "maintenance";
export type LogTone = "success" | "control" | "warning" | "danger";
export type AlertTone = "danger" | "warning";

export type LiveBay = {
  id: string;
  name: string;
  zone: string;
  status: LiveBayStatus;
  customer?: string;
  reservationName?: string;
  people?: number;
  totalMinutes?: number;
  remainingMinutes?: number;
  startedAt?: string;
  endsAt?: string;
  nextReservation?: string;
  mode: string;
  note: string;
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

export const quickActions = [
  {
    label: "입장 세션 시작",
    description: "예약자 또는 현장 방문 고객에게 이용 시간을 부여하고 자동제어를 실행합니다.",
    href: "/admin/automation",
    icon: Timer
  },
  {
    label: "매장 준비 ON",
    description: "로비 조명, 키오스크, 냉난방기, 해당 타석 전원을 순차적으로 켭니다.",
    href: "/admin/automation",
    icon: Power
  },
  {
    label: "타석 배정",
    description: "고객 인원과 예약 시간에 맞춰 이용 타석과 키오스크 시간을 배정합니다.",
    href: "/admin/bays",
    icon: MonitorCog
  },
  {
    label: "제어 로그 출력",
    description: "장비 ON/OFF, 이용시간 연장, 강제 종료 이력을 확인합니다.",
    href: "/admin/reports",
    icon: FileText
  }
] as const;

export const liveBayRows: LiveBay[] = [
  {
    id: "A01",
    name: "A-01",
    zone: "A구역",
    status: "in_use",
    customer: "서진 / 010-****-2001",
    people: 2,
    totalMinutes: 120,
    remainingMinutes: 74,
    startedAt: "09:30",
    endsAt: "11:30",
    nextReservation: "13:00 단체 예약",
    mode: "회원 예약 입장",
    note: "키오스크 120분 세션 진행 중"
  },
  {
    id: "A02",
    name: "A-02",
    zone: "A구역",
    status: "in_use",
    customer: "도윤 / 010-****-2002",
    people: 1,
    totalMinutes: 90,
    remainingMinutes: 8,
    startedAt: "10:00",
    endsAt: "11:30",
    nextReservation: "12:00 개인 예약",
    mode: "회원 예약 입장",
    note: "종료 안내 또는 30분 연장 확인 필요"
  },
  {
    id: "B01",
    name: "B-01",
    zone: "B구역",
    status: "available",
    people: 4,
    nextReservation: "11:00 현장 입장 요청",
    mode: "즉시 배정 가능",
    note: "조명과 타석 전원 대기 상태"
  },
  {
    id: "B02",
    name: "B-02",
    zone: "B구역",
    status: "waiting",
    reservationName: "지안 / 010-****-2003",
    people: 3,
    startedAt: "11:00 예약",
    nextReservation: "예약자 인증 대기",
    mode: "입장 인증 대기",
    note: "전화번호 또는 QR 인증 후 세션 시작"
  },
  {
    id: "C01",
    name: "C-01",
    zone: "C구역",
    status: "maintenance",
    nextReservation: "배정 차단",
    mode: "장비 점검 필요",
    note: "Tapo 플러그 오프라인 확인"
  }
];

export const adminAlertRows: AdminAlert[] = [
  {
    id: "alert-1",
    title: "B-02 입장 인증 대기",
    description: "11:00 예약 고객이 아직 키오스크 인증을 완료하지 않았습니다.",
    tone: "warning"
  },
  {
    id: "alert-2",
    title: "C-01 타석 전원 확인 필요",
    description: "Tapo 플러그가 오프라인 상태입니다. 현장 점검 또는 수동 전원 확인이 필요합니다.",
    tone: "danger"
  }
];

export const noShowRows: NoShowRow[] = [
  {
    id: "noshow-1",
    time: "10:30",
    member: "민지 / 010-****-4102",
    bay: "미배정",
    action: "노쇼 확인 후 다음 예약은 수동 승인"
  }
];

export const entryCheckRows = [
  { name: "입장 인증", method: "예약 QR/전화번호", state: "정상", next: "예약 시간 기준 키오스크 세션 시작" },
  { name: "로비 키오스크", method: "Tapo 플러그", state: "ON", next: "상시 운영" },
  { name: "무예약 입장", method: "관리자 승인", state: "대기", next: "빈 타석 확인 후 시간 부여" }
];

export const accessSessionRows = [
  { time: "09:30", member: "서진 / 010-****-2001", bay: "A-01", people: "2명", remaining: "74분", status: "이용 중" },
  { time: "10:00", member: "도윤 / 010-****-2002", bay: "A-02", people: "1명", remaining: "8분", status: "종료 임박" },
  { time: "11:00", member: "지안 / 010-****-2003", bay: "B-02", people: "3명", remaining: "입장 대기", status: "예약 확인" }
];

export const automationDeviceRows = [
  { zone: "쇼룸", device: "골프룸 켜기", type: "헤이홈 빠른실행", state: "테스트 가능", action: "예약 10분 전 매장 준비" },
  { zone: "입구", device: "비스타 입구", type: "헤이홈 스위치", state: "대기", action: "출입문 제어는 수동 검토" },
  { zone: "골프룸", device: "골프룸조명스위치", type: "헤이홈 스위치", state: "대기", action: "예약 준비 ON / 마감 OFF" },
  { zone: "골프룸", device: "골프룸 AC", type: "헤이홈 냉난방", state: "대기", action: "예약 10분 전 ON" },
  { zone: "홀", device: "비스타 홀AC", type: "헤이홈 냉난방", state: "대기", action: "영업시간 또는 예약 준비 ON" },
  { zone: "1번타석", device: "1번타석 PC", type: "Tapo 플러그", state: "테스트 가능", action: "PC 전원 인가 / 자동부팅" },
  { zone: "1번타석", device: "1번타석 프로젝터", type: "헤이홈 플러그", state: "테스트 가능", action: "프로젝터 전원 ON" },
  { zone: "1번타석", device: "1번타석 리시버", type: "헤이홈 플러그", state: "테스트 가능", action: "리시버 전원 ON" },
  { zone: "2번타석", device: "2번타석 PC", type: "Tapo 플러그", state: "테스트 가능", action: "PC 전원 인가 / 자동부팅" },
  { zone: "2번타석", device: "2번타석 프로젝터", type: "헤이홈 플러그", state: "테스트 가능", action: "프로젝터 전원 ON" },
  { zone: "3번타석", device: "3번타석 PC", type: "Tapo 플러그", state: "테스트 가능", action: "PC 전원 인가 / 자동부팅" },
  { zone: "3번타석", device: "3번타석 프로젝터", type: "헤이홈 플러그", state: "테스트 가능", action: "프로젝터 전원 ON" }
];

export const automationLogRows: ControlLog[] = [
  { id: "log-1", time: "09:20", target: "A-01 냉난방기", event: "예약 10분 전 ON", result: "성공", tone: "success" },
  { id: "log-2", time: "09:25", target: "A-01 타석 조명", event: "예약 입장 준비 ON", result: "성공", tone: "success" },
  { id: "log-3", time: "09:31", target: "A-01 키오스크", event: "120분 세션 시작", result: "성공", tone: "control" },
  { id: "log-4", time: "10:52", target: "A-02 키오스크", event: "종료 10분 전 알림", result: "확인 필요", tone: "warning" },
  { id: "log-5", time: "10:55", target: "C-01 타석 전원", event: "오프라인 감지", result: "확인 필요", tone: "danger" }
];

export const showroomAutomationScenarios = [
  {
    name: "예약 10분 전 준비",
    trigger: "예약 시간 -10분",
    steps: "골프룸 조명/AC → 해당 타석 PC(Tapo) → 프로젝터/리시버(헤이홈) ON"
  },
  {
    name: "입장 후 이용 시작",
    trigger: "고객 예약 인증 또는 관리자 승인",
    steps: "타석 배정 → 키오스크 시간 부여 → 이용 세션 시작"
  },
  {
    name: "이용 종료 정리",
    trigger: "예약 종료 시간 +5분",
    steps: "타석 PC/프로젝터/리시버 OFF → 조명/냉난방 정리 → 로그 저장"
  },
  {
    name: "마감 전체 OFF",
    trigger: "관리자 수동 실행",
    steps: "골프룸/홀/타석 전원 순차 OFF, 자동문은 1차 제외"
  }
];

export const reservationRows = [
  { time: "09:30", member: "서진 / 010-****-2001", bay: "A-01", channel: "회원 앱", status: "이용 중", approval: "자동 확정" },
  { time: "10:00", member: "도윤 / 010-****-2002", bay: "A-02", channel: "회원 앱", status: "이용 중", approval: "자동 확정" },
  { time: "10:30", member: "민지 / 010-****-4102", bay: "미배정", channel: "회원 앱", status: "노쇼 확인", approval: "관리자 확인" },
  { time: "11:00", member: "지안 / 010-****-2003", bay: "B-02", channel: "회원 앱", status: "입장 대기", approval: "키오스크 인증 대기" },
  { time: "13:00", member: "단체 예약 / 6명", bay: "미배정", channel: "전화 예약", status: "승인 대기", approval: "매장 승인" }
];

export const storeSummaryRows = [
  { store: "비스타파크골프 시흥점", region: "경기 시흥", reservations: "38건", status: "무인 운영중" },
  { store: "비스타파크골프 분당점", region: "경기 성남", reservations: "21건", status: "직원 운영" },
  { store: "비스타파크골프 일산점", region: "경기 고양", reservations: "준비중", status: "설치 준비" }
];

export const operations = [
  { name: "입장 인증", metric: "QR/전화번호", icon: CheckCircle2 },
  { name: "조명 제어", metric: "스위치", icon: Lightbulb },
  { name: "냉난방 제어", metric: "IR", icon: Snowflake },
  { name: "키오스크 세션", metric: "시간제어", icon: Timer },
  { name: "회원 모바일 예약", metric: "PWA", icon: Smartphone },
  { name: "본사 가맹점 관리", metric: "전체 현황", icon: Building2 },
  { name: "장비 점검", metric: "오프라인 감지", icon: Wrench },
  { name: "제어 로그", metric: "감사 이력", icon: Activity },
  { name: "매장 위치 관리", metric: "가맹점", icon: MapPin },
  { name: "운영시간 설정", metric: "자동 규칙", icon: Clock3 },
  { name: "회원관리", metric: "방문/노쇼", icon: Users },
  { name: "예약 승인", metric: "수동/자동", icon: ClipboardList }
];

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
