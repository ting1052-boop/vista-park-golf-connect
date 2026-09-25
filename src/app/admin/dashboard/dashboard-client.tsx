"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Home,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  PlusCircle,
  Power,
  Search,
  ShieldCheck,
  UserCheck,
  Wifi,
  Wrench,
  X,
  Zap
} from "lucide-react";
import {
  getAdminNavItems,
  type AdminAlert,
  type ControlLog,
  type LiveBay,
  type LiveBayStatus,
  type LogTone
} from "@/lib/dashboard-data";
import type { AdminContext, AdminStoreOption } from "@/lib/admin-context";
import { StoreSwitcher } from "@/components/store-switcher";
import type { AutomationDeviceStatusRow, PowerState } from "@/lib/supabase/automation-status";
import {
  ADMIN_MAX_HOURS,
  ADMIN_MIN_HOURS,
  getBlockMinutes,
  getBonusMinutesForDuration,
  getPriceForDuration
} from "@/lib/reservation-policy";
import { subscribeToBays, updateBayStatus } from "@/lib/supabase/bays";
import type { DashboardReservationRow, DashboardReservationSummary } from "@/lib/supabase/dashboard";
import { AdminQuickNav } from "@/components/admin-quick-nav";

const VISTA_GREEN = "#4E8969";
const RING_SIZE = 104;
const RING_RADIUS = 40;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const statusMeta: Record<
  LiveBayStatus,
  {
    label: string;
    icon: LucideIcon;
    badge: string;
    card: string;
    iconBox: string;
    dot: string;
  }
> = {
  in_use: {
    label: "이용 중",
    icon: Activity,
    badge: "border-sky-300 bg-sky-100 text-sky-800",
    card: "border-sky-300 bg-sky-50/80",
    iconBox: "bg-sky-100 text-sky-700",
    dot: "bg-sky-500"
  },
  available: {
    label: "사용 가능",
    icon: CheckCircle2,
    badge: "border-emerald-300 bg-emerald-100 text-emerald-800",
    card: "border-emerald-300 bg-emerald-50/80",
    iconBox: "bg-emerald-100 text-emerald-700",
    dot: "bg-emerald-500"
  },
  waiting: {
    label: "입장 대기",
    icon: Clock3,
    badge: "border-amber-300 bg-amber-100 text-amber-800",
    card: "border-amber-300 bg-amber-50/85",
    iconBox: "bg-amber-100 text-amber-700",
    dot: "bg-amber-500"
  },
  maintenance: {
    label: "점검 필요",
    icon: Wrench,
    badge: "border-rose-300 bg-rose-100 text-rose-800",
    card: "border-rose-300 bg-rose-50/85",
    iconBox: "bg-rose-100 text-rose-700",
    dot: "bg-rose-500"
  }
};

const logToneClass: Record<LogTone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  control: "border-sky-200 bg-sky-50 text-sky-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-rose-200 bg-rose-50 text-rose-700"
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getCurrentTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function addMinutesToClock(time: string | undefined, minutes: number) {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return undefined;
  const [hour, minute] = time.split(":").map(Number);
  const total = hour * 60 + minute + minutes;
  const normalized = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function formatSessionDateTime(value: string | undefined) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function getEntryMethodLabel(value: string | undefined) {
  if (value === "kiosk") return "입구 키오스크";
  if (value === "admin") return "관리자 접수";
  if (value === "member_app") return "회원 예약";
  return value || "확인 필요";
}

type DashboardClientProps = {
  currentStoreId: string;
  adminContext: AdminContext;
  stores?: AdminStoreOption[];
  initialBays: LiveBay[];
  initialReservations?: DashboardReservationRow[];
  initialAlerts?: AdminAlert[];
  initialNoShows?: NoShowRow[];
  initialTodayReservationSummary?: DashboardReservationSummary;
  initialAutomationDevices?: AutomationDeviceStatusRow[];
  initialSharedPower?: PowerState;
  initialError?: string | null;
};

type NoShowRow = {
  id: string;
  time: string;
  member: string;
  bay: string;
  action: string;
};

const emptyTodayReservationSummary: DashboardReservationSummary = {
  total: 0,
  app: 0,
  walkInPhone: 0
};

export function DashboardClient({
  currentStoreId,
  adminContext,
  stores = [],
  initialBays,
  initialReservations = [],
  initialAlerts = [],
  initialNoShows = [],
  initialTodayReservationSummary = emptyTodayReservationSummary,
  initialAutomationDevices = [],
  initialSharedPower = { on: null, failed: false, lastRunAt: null },
  initialError = null
}: DashboardClientProps) {
  const router = useRouter();
  const [bays, setBays] = useState<LiveBay[]>(initialBays);
  const [alerts, setAlerts] = useState<AdminAlert[]>(initialAlerts);
  const [noShows, setNoShows] = useState<NoShowRow[]>(initialNoShows);
  const [reservations, setReservations] = useState<DashboardReservationRow[]>(initialReservations);
  const [todayReservationSummary, setTodayReservationSummary] = useState<DashboardReservationSummary>(
    initialTodayReservationSummary
  );
  const [logs, setLogs] = useState<ControlLog[]>([]);
  const [now, setNow] = useState<Date | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(initialError);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isUsageDetailOpen, setIsUsageDetailOpen] = useState(false);
  const automationDevices: AutomationDeviceStatusRow[] = initialAutomationDevices;
  const sharedPower: PowerState = initialSharedPower;
  const navItems = getAdminNavItems(adminContext.limitedMenu);

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setBays(initialBays);
    setAlerts(initialAlerts);
    setNoShows(initialNoShows);
    setReservations(initialReservations);
    setTodayReservationSummary(initialTodayReservationSummary);
    setDataError(initialError);
  }, [initialAlerts, initialBays, initialError, initialNoShows, initialReservations, initialTodayReservationSummary]);

  useEffect(() => {
    try {
      return subscribeToBays(() => {
        // A bay status change does not contain enough information to identify
        // an active access session. Re-read the server-derived view instead.
        router.refresh();
        setDataError(null);
      }, currentStoreId);
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "타석 실시간 구독을 시작하지 못했습니다.");
      return undefined;
    }
  }, [currentStoreId, router]);

  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, [router]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const summary = useMemo(() => {
    const inUse = bays.filter((bay) => bay.status === "in_use" && (bay.remainingMinutes ?? 1) > 0).length;
    const waiting = bays.filter((bay) => bay.status === "waiting").length;
    const available = bays.filter((bay) => bay.status === "available").length;
    const maintenance = bays.filter((bay) => bay.status === "maintenance").length;
    const people = bays.reduce(
      (sum, bay) => sum + (bay.status === "in_use" && (bay.remainingMinutes ?? 1) > 0 ? bay.people ?? 0 : 0),
      0
    );

    return { inUse, waiting, available, maintenance, people };
  }, [bays]);

  const soonEndingBays = useMemo(
    () =>
      bays.filter(
        (bay) =>
          bay.status === "in_use" &&
          (bay.remainingMinutes ?? 999) > 0 &&
          (bay.remainingMinutes ?? 999) <= 10
      ),
    [bays]
  );

  const overtimeBays = useMemo(
    () => bays.filter((bay) => bay.status === "in_use" && (bay.remainingMinutes ?? 999) <= 0),
    [bays]
  );
  const usageDetailBays = useMemo(() => bays.filter((bay) => bay.status === "in_use"), [bays]);

  const nowText = now
    ? now.toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      })
    : "--:--:--";

  const todayText = now
    ? now.toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long"
      })
    : "";

  const addLog = (target: string, event: string, result = "완료", tone: LogTone = "control") => {
    setLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        time: getCurrentTime(),
        target,
        event,
        result,
        tone
      },
      ...prev
    ].slice(0, 8));
  };

  const syncBayStatus = async (bay: LiveBay, status: LiveBayStatus) => {
    setIsSyncing(true);
    const { error } = await updateBayStatus(bay.id, status);
    setIsSyncing(false);

    if (error) {
      setDataError(`Supabase 저장 실패: ${error.message}`);
      addLog(bay.name, "Supabase 타석 상태 저장", "실패", "warning");
      return false;
    }

    setDataError(null);
    return true;
  };

  // 매장 단위 장비 제어. 무인제어 탭으로 넘어가지 않고 대시보드에서 바로 실행한다.
  const handleStoreControl = async (
    action: "shared_on" | "shared_off" | "store_prepare" | "store_close",
    confirmation: string,
    logLabel: string
  ) => {
    if (!window.confirm(confirmation)) return;

    setIsSyncing(true);
    try {
      const post = (force: boolean) =>
        fetch("/api/admin/automation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(force ? { action, force: true } : { action })
        });

      let response = await post(false);
      let data = (await response.json()) as {
        ok?: boolean;
        message?: string;
        requiresForce?: boolean;
        activeSessionCount?: number;
      };

      // 이용 중 타석 때문에 매장 종료가 막히면, 강제 종료를 한 번 더 확인받고 재시도한다.
      if (response.status === 409 && data.requiresForce) {
        const count = data.activeSessionCount ?? 0;
        const forceConfirmed = window.confirm(
          `이용 중이거나 시간이 지난 타석이 ${count}개 있습니다.\n\n` +
            "그래도 매장을 종료하면 그 타석들의 이용을 강제로 끝내고 타석 PC를 모두 종료합니다.\n" +
            "손님이 실제로 이용 중이면 진행하지 마세요.\n\n정말 모두 종료할까요?"
        );
        if (!forceConfirmed) {
          setToast("매장 종료를 취소했습니다.");
          return;
        }
        response = await post(true);
        data = (await response.json()) as typeof data;
      }

      if (!response.ok || data.ok === false) {
        const message = data.message ?? "장비 제어에 실패했습니다.";
        setDataError(message);
        addLog("매장", logLabel, "실패", "danger");
        setToast(message);
        return;
      }

      setDataError(null);
      addLog("매장", logLabel, "요청됨", "control");
      setToast(data.message ?? "매장 제어기에 명령을 전달했습니다.");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "장비 제어 중 오류가 발생했습니다.";
      setDataError(message);
      addLog("매장", logLabel, "실패", "danger");
      setToast(message);
    } finally {
      setIsSyncing(false);
    }
  };

  // 이 버튼은 장비만 끄는 것이 아니다. 하는 일을 전부 적어두지 않으면
  // "장비 OFF" 라는 이름만 보고 전원만 내리는 줄 알게 된다.
  // PC 는 여기서 꺼지지 않는다. PC 종료는 무인제어 탭의 타석 토글(shutdown_pc)이 한다.
  const handleEndSession = async (bay: LiveBay) => {
    const confirmed = window.confirm(
      `${bay.name} 이용을 종료합니다.\n\n` +
        "· 이용 시간을 끝내고 타석을 배정 가능으로 되돌립니다\n" +
        "· 손님 키오스크 화면을 잠급니다\n" +
        "· 타석 프로젝터와 공용 조명·냉난방 OFF 를 매장 제어기에 요청합니다\n" +
        "· 타석 PC 는 켜둡니다 (PC 종료는 무인제어 탭에서)\n\n" +
        "진행할까요?"
    );
    if (!confirmed) return;

    setIsSyncing(true);
    const response = await fetch("/api/admin/session/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bay.accessSessionId ? { accessSessionId: bay.accessSessionId } : { bayId: bay.id })
    });
    const data = (await response.json()) as { ok?: boolean; message?: string; automationStatus?: "requested" | "failed" | "skipped" };
    setIsSyncing(false);

    if (!response.ok || !data.ok) {
      const message = data.message ?? "이용 종료 처리에 실패했습니다.";
      setDataError(message);
      addLog(bay.name, "관리자 이용 종료", "실패", "danger");
      setToast(message);
      return;
    }

    setBays((prev) =>
      prev.map((item) =>
        item.id === bay.id
          ? {
              ...item,
              status: "available",
              accessSessionId: undefined,
              reservationId: undefined,
              sessionStatus: undefined,
              entryMethod: undefined,
              customer: undefined,
              remainingMinutes: undefined,
              startedAt: undefined,
              endsAt: undefined,
              startedAtIso: undefined,
              endsAtIso: undefined,
              mode: "즉시 배정 가능",
              note: "관리자 이용 종료"
            }
          : item
      )
    );

    // "요청함" 과 "성공" 을 구분한다. 서버가 돌려주는 requested 는 매장 제어기에
    // 명령을 넘겼다는 뜻이고, 기기가 실제로 꺼졌다는 확인은 아니다.
    // 프로젝터·에어컨은 IR 이라 Home Assistant 도 꺼졌는지 읽지 못한다.
    const automationFailed = data.automationStatus === "failed";
    const automationSkipped = data.automationStatus === "skipped";
    addLog(
      bay.name,
      automationFailed
        ? "이용 종료 완료, 장비 OFF 요청 실패"
        : automationSkipped
          ? "이용 종료 완료, 장비 OFF 는 건너뜀"
          : "이용 종료, 키오스크 잠금, 장비 OFF 요청함",
      automationFailed ? "자동화 실패" : automationSkipped ? "일부 생략" : "요청함",
      automationFailed ? "danger" : automationSkipped ? "warning" : "control"
    );
    setToast(
      automationFailed
        ? `${bay.name} 이용은 종료됐지만 장비 OFF 요청이 실패했습니다. 무인제어 탭에서 확인하세요.`
        : `${bay.name} 이용을 종료하고 장비 OFF 를 요청했습니다.`
    );
  };

  // 이용 중인 타석의 종료 시각을 실제로 조정한다.
  // 예전에는 화면 숫자만 바꿔 새로고침하면 원래대로 돌아갔다.
  const handleExtendTime = async (bay: LiveBay) => {
    const input = window.prompt(
      `${bay.name} 이용시간을 몇 분 조정할까요?\n연장은 30, 단축은 -30 처럼 입력합니다. (현재 종료 ${bay.endsAt ?? "-"})`,
      "30"
    );
    if (input === null) return;

    const minutes = Number(input.trim());
    if (!Number.isInteger(minutes) || minutes === 0) {
      setToast("조정할 시간을 분 단위 숫자로 입력해주세요. (예: 30, -30)");
      return;
    }

    setIsSyncing(true);
    try {
      const response = await fetch("/api/admin/session/extend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          bay.accessSessionId ? { accessSessionId: bay.accessSessionId, minutes } : { bayId: bay.id, minutes }
        )
      });
      const data = (await response.json()) as { ok?: boolean; message?: string; remainingMinutes?: number };

      if (!response.ok || data.ok === false) {
        const message = data.message ?? "이용시간 조정에 실패했습니다.";
        setDataError(message);
        addLog(bay.name, "관리자 이용시간 조정", "실패", "danger");
        setToast(message);
        return;
      }

      setDataError(null);
      addLog(bay.name, minutes > 0 ? `관리자 ${minutes}분 연장` : `관리자 ${Math.abs(minutes)}분 단축`, "성공", "success");
      setToast(data.message ?? "이용시간을 조정했습니다.");
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "이용시간 조정 중 오류가 발생했습니다.";
      setDataError(message);
      addLog(bay.name, "관리자 이용시간 조정", "실패", "danger");
      setToast(message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCheckIn = async (bay: LiveBay) => {
    const hoursValue = window.prompt(
      `${bay.name} 타석 이용시간을 시간 단위로 입력해주세요.\n(${ADMIN_MIN_HOURS}~${ADMIN_MAX_HOURS}시간)`,
      "1"
    );

    if (hoursValue === null) return;

    const hours = Number(hoursValue.trim());
    if (!Number.isInteger(hours) || hours < ADMIN_MIN_HOURS || hours > ADMIN_MAX_HOURS) {
      setToast(`이용시간은 ${ADMIN_MIN_HOURS}~${ADMIN_MAX_HOURS} 사이의 시간 단위로 입력해주세요.`);
      return;
    }

    const durationMinutes = hours * 60;
    const price = getPriceForDuration(durationMinutes);
    const bonusMinutes = getBonusMinutesForDuration(durationMinutes);
    const confirmed = window.confirm(
      `${bay.name} 타석을 ${hours}시간으로 입장 처리할까요?\n` +
        `서비스 ${bonusMinutes}분 포함 · 실제 이용 ${getBlockMinutes(durationMinutes)}분\n` +
        `요금 ${price.toLocaleString("ko-KR")}원`
    );
    if (!confirmed) return;

    const currentTime = getCurrentTime();
    const dueTime = addMinutesToClock(currentTime, getBlockMinutes(durationMinutes)) ?? `${durationMinutes}분 후`;
    const customer = bay.reservationName ?? "현장 고객";

    setIsSyncing(true);
    const response = await fetch("/api/admin/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeId: currentStoreId,
        bayId: bay.id,
        durationMinutes,
        guestName: customer
      })
    });
    const data = (await response.json()) as { ok?: boolean; message?: string; automationStatus?: "requested" | "failed" | "skipped" };
    setIsSyncing(false);

    if (!response.ok || !data.ok) {
      const message = data.message ?? "입장 처리에 실패했습니다.";
      setDataError(message);
      addLog(bay.name, "관리자 수동 입장", "실패", "danger");
      setToast(message);
      return;
    }

    setBays((prev) =>
      prev.map((item) =>
        item.id === bay.id
          ? {
              ...item,
              status: "in_use",
              customer,
              totalMinutes: getBlockMinutes(durationMinutes),
              remainingMinutes: getBlockMinutes(durationMinutes),
              startedAt: currentTime,
              endsAt: dueTime,
              mode: "입장 처리 완료",
              note: "관리자 접수 세션 시작"
            }
          : item
      )
    );
    setAlerts((prev) => prev.filter((alert) => !alert.description.includes(customer.split(" / ")[0])));
    addLog(
      bay.name,
      data.automationStatus === "failed" ? `${customer} 입장 처리, 장비 자동 ON 확인 필요` : `${customer} 입장 처리, 장비 자동 ON`,
      data.automationStatus === "failed" ? "자동화 실패" : "성공",
      data.automationStatus === "failed" ? "warning" : "success"
    );
    setToast(`${bay.name} 입장 처리와 세션 시작이 완료되었습니다.`);
  };

  const handleMaintenanceDone = async (bay: LiveBay) => {
    setBays((prev) =>
      prev.map((item) =>
        item.id === bay.id
          ? {
              ...item,
              status: "available",
              mode: "즉시 배정 가능",
              note: "점검 완료, 예약 배정 가능",
              nextReservation: "예약 배정 가능"
            }
          : item
      )
    );
    setAlerts((prev) => prev.filter((alert) => !alert.title.includes(bay.name)));
    await syncBayStatus(bay, "available");
    addLog(bay.name, "장비 점검 완료, 타석 상태 정상 전환", "성공", "success");
    setToast(`${bay.name} 점검 완료로 변경했습니다.`);
  };

  const metrics = [
    {
      label: "현재 이용 중",
      mobileLabel: "이용 중",
      value: `${summary.inUse} / ${bays.length}`,
      mobileValue: `${summary.inUse}/${bays.length}`,
      helper: overtimeBays.length > 0 ? `종료 확인 ${overtimeBays.length}건 · 눌러서 상세 보기` : "눌러서 이용 상세 보기",
      icon: Activity,
      className: "border-sky-200 bg-sky-50 text-sky-700",
      onClick: () => setIsUsageDetailOpen(true)
    },
    { label: "사용 가능", mobileLabel: "빈 타석", value: `${summary.available}`, helper: "즉시 배정 가능한 타석", icon: CheckCircle2, className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
    { label: "점검/알림", mobileLabel: "알림", value: `${summary.maintenance + alerts.length + noShows.length + overtimeBays.length}`, helper: "확인 필요한 항목", icon: AlertTriangle, className: "border-rose-200 bg-rose-50 text-rose-700" },
    {
      label: "오늘 예약·입장",
      mobileLabel: "오늘",
      value: `${todayReservationSummary.total}`,
      helper:
        todayReservationSummary.total > 0
          ? `앱 ${todayReservationSummary.app}건, 현장/전화 ${todayReservationSummary.walkInPhone}건`
          : "오늘 접수된 예약 없음",
      icon: CalendarClock,
      className: "border-slate-200 bg-slate-50 text-slate-700"
    }
  ];

  const showWarningBanner =
    alerts.length > 0 || soonEndingBays.length > 0 || overtimeBays.length > 0 || noShows.length > 0;

  return (
    <main className="min-h-screen bg-[#eef2ec] text-vista-ink">
      <div className="grid min-h-screen lg:grid-cols-[292px_1fr]">
        <aside className="hidden border-r border-[#d9e3d5] bg-white lg:block">
          <div className="flex h-full flex-col">
            <div className="border-b border-[#e5ece1] px-6 py-6">
              <div className="flex items-center gap-3">
                <div className="grid size-12 place-items-center rounded-md bg-vista-leaf text-white shadow-soft-line">
                  <Home size={23} aria-hidden="true" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-vista-leaf">VISTA</p>
                  <h1 className="text-lg font-extrabold">Park Golf Connect</h1>
                </div>
              </div>
              <p className="mt-3 text-xs font-semibold text-[#697468]">무인 매장 운영·예약·장비제어</p>
            </div>

            <nav className="flex-1 space-y-1 px-4 py-5" aria-label="관리자 메뉴">
              {navItems.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`flex w-full items-center justify-between rounded-md px-4 py-3 text-left text-sm font-bold transition ${
                    item.active
                      ? "bg-vista-leaf text-white shadow-soft-line"
                      : "text-[#4f5b50] hover:bg-vista-fairway hover:text-vista-ink"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <LayoutDashboard size={18} aria-hidden="true" />
                    {item.label}
                  </span>
                  {item.active ? <ArrowRight size={16} aria-hidden="true" /> : null}
                </Link>
              ))}
            </nav>

            <div className="border-t border-[#e5ece1] p-4">
              <div className="rounded-md border border-[#dfe8dc] bg-vista-fairway p-4">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="text-vista-leaf" size={23} aria-hidden="true" />
                  <div>
                    <p className="text-sm font-extrabold">{adminContext.roleLabel}</p>
                    <p className="text-xs font-semibold text-[#697468]">권한 적용 완료</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const supabase = createBrowserSupabaseClient();
                    await supabase.auth.signOut();
                    router.replace("/admin/login");
                    router.refresh();
                  }}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-md border border-[#cad8c6] bg-white px-3 py-2 text-sm font-bold text-[#384437]"
                >
                  <LogOut size={16} aria-hidden="true" />
                  로그아웃
                </button>
              </div>
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="sticky top-0 z-10 border-b border-[#d9e3d5] bg-white/95 backdrop-blur">
            <div className="flex items-center gap-3 px-4 py-4 sm:px-6 lg:px-8">
              <div className="min-w-0 flex-1">
                {adminContext.isHeadAdmin ? (
                  <StoreSwitcher
                    stores={stores}
                    currentStoreId={adminContext.storeId}
                    currentStoreName={adminContext.storeName}
                  />
                ) : (
                  <p className="text-sm font-bold text-vista-leaf">{adminContext.storeName}</p>
                )}
                <h2 className="truncate text-xl font-extrabold sm:text-2xl">무인 매장 운영 대시보드</h2>
              </div>

              <div className="hidden text-right lg:block">
                <p className="text-xs font-bold text-[#7a8678]">{todayText}</p>
                <p className="mt-0.5 font-mono text-xl font-extrabold tabular-nums text-vista-ink">{nowText}</p>
              </div>

              <label className="hidden min-w-[270px] items-center gap-2 rounded-md border border-[#d9e4d6] bg-[#fbfcfa] px-3 py-2 md:flex">
                <Search size={18} className="text-[#697468]" aria-hidden="true" />
                <input
                  className="w-full bg-transparent text-sm outline-none placeholder:text-[#879184]"
                  placeholder="회원, 예약, 타석, 장비 검색"
                />
              </label>

              <div className="hidden rounded-md border border-[#d9e4d6] bg-vista-fairway px-4 py-2 text-sm font-bold text-vista-leaf sm:block">
                {adminContext.roleLabel}
              </div>
              <button className="relative grid size-11 place-items-center rounded-md border border-[#d9e4d6] bg-white text-vista-ink">
                <Bell size={20} aria-hidden="true" />
                {showWarningBanner ? <span className="absolute right-2 top-2 size-2 rounded-full bg-rose-500" /> : null}
                <span className="sr-only">알림</span>
              </button>
            </div>
            <AdminQuickNav />
          </header>

          <div className="px-4 py-6 sm:px-6 lg:px-8">
            {dataError ? (
              <section className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-900 shadow-soft-line">
                Supabase 연결 안내: {dataError} 실제 데이터를 불러오지 못한 영역은 빈 상태로 표시됩니다.
              </section>
            ) : null}

            {isSyncing ? (
              <section className="mb-5 rounded-md border border-vista-mint bg-vista-fairway px-5 py-4 text-sm font-bold text-vista-leaf shadow-soft-line">
                Supabase에 타석 상태를 저장하는 중입니다.
              </section>
            ) : null}

            <section className="grid min-w-0 grid-cols-4 gap-1.5 sm:gap-3" aria-label="주요 지표">
              {metrics.map((item) => {
                const Icon = item.icon;
                const content = (
                  <>
                    <div className="flex min-w-0 flex-col items-center justify-center sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <div className="min-w-0">
                        <p className="whitespace-nowrap text-center text-[11px] font-bold leading-4 text-[#697468] sm:text-left sm:text-sm">
                          <span className="sm:hidden">{item.mobileLabel}</span>
                          <span className="hidden sm:inline">{item.label}</span>
                        </p>
                        <strong className="mt-1 block whitespace-nowrap text-center text-lg font-extrabold leading-tight sm:mt-2 sm:text-left sm:text-3xl">
                          <span className="sm:hidden">{"mobileValue" in item ? item.mobileValue : item.value}</span>
                          <span className="hidden sm:inline">{item.value}</span>
                        </strong>
                      </div>
                      <span className={cn("hidden size-11 shrink-0 place-items-center rounded-md border sm:grid", item.className)}>
                        <Icon size={21} aria-hidden="true" />
                      </span>
                    </div>
                    {item.helper ? <p className="hidden text-sm font-semibold text-[#5f6b5e] sm:mt-4 sm:block">{item.helper}</p> : null}
                  </>
                );

                if ("onClick" in item && item.onClick) {
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={item.onClick}
                      className="min-w-0 rounded-md border border-[#dfe8dc] bg-white px-1 py-2 text-left shadow-soft-line transition hover:border-sky-400 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500 sm:p-5"
                      aria-haspopup="dialog"
                      aria-label={`${item.label} ${item.value} 상세 보기`}
                    >
                      {content}
                    </button>
                  );
                }

                return (
                  <article key={item.label} className="min-w-0 rounded-md border border-[#dfe8dc] bg-white px-1 py-2 shadow-soft-line sm:p-5">
                    {content}
                  </article>
                );
              })}
            </section>

            {showWarningBanner ? (
              <section className="mt-5 animate-[pulse-border_1.8s_ease-in-out_infinite] rounded-md border-2 border-amber-300 bg-amber-50 p-5 shadow-soft-line">
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="text-amber-700" size={24} aria-hidden="true" />
                    <div>
                      <h3 className="text-lg font-extrabold text-amber-900">확인 필요한 운영 알림</h3>
                      <p className="text-sm font-semibold text-amber-800">미퇴장, 종료 임박, 노쇼, 장비 이상을 한 번에 확인합니다.</p>
                    </div>
                  </div>
                  <span className="rounded-md bg-white px-3 py-1 text-sm font-extrabold text-amber-800">
                    {alerts.length + soonEndingBays.length + overtimeBays.length + noShows.length}건
                  </span>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {overtimeBays.map((bay) => (
                    <WarningItem
                      key={`overtime-${bay.id}`}
                      title={`${bay.name} 미퇴장 확인 필요`}
                      description={`${bay.customer ?? "이용 고객"}의 이용 시간이 초과되었습니다. 퇴장 안내 또는 추가 연장 처리가 필요합니다.`}
                      actionLabel="이용 종료"
                      onAction={() => handleEndSession(bay)}
                    />
                  ))}
                  {soonEndingBays.map((bay) => (
                    <WarningItem
                      key={`soon-${bay.id}`}
                      title={`${bay.name} 이용시간 종료 임박`}
                      description={`${bay.customer ?? "이용 고객"}의 남은 시간이 ${bay.remainingMinutes}분입니다. 연장 또는 종료 안내가 필요합니다.`}
                      actionLabel="시간 조정"
                      onAction={() => handleExtendTime(bay)}
                    />
                  ))}
                  {noShows.map((row) => (
                    <WarningItem
                      key={row.id}
                      title={`${row.time} 예약 노쇼 확인`}
                      description={`${row.member} / ${row.bay} / ${row.action}`}
                    />
                  ))}
                  {alerts.map((alert) => (
                    <WarningItem
                      key={alert.id}
                      title={alert.title}
                      description={alert.description}
                      actionLabel="확인 처리"
                      onAction={() => setAlerts((prev) => prev.filter((item) => item.id !== alert.id))}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            <section className="mt-5 rounded-md border border-[#dfe8dc] bg-white shadow-soft-line" aria-label="매장 장비 제어">
              <div className="flex flex-col gap-2 border-b border-[#e5ece1] p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-vista-leaf">매장 장비 제어</p>
                  <h3 className="mt-1 text-lg font-extrabold">여기서 바로 켜고 끕니다</h3>
                </div>
                <span
                  className={cn(
                    "inline-flex w-fit items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-extrabold",
                    sharedPower.failed
                      ? "border-rose-300 bg-rose-50 text-rose-700"
                      : sharedPower.on
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-gray-300 bg-gray-100 text-gray-500"
                  )}
                >
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      sharedPower.failed ? "bg-rose-500" : sharedPower.on ? "bg-emerald-500" : "bg-gray-400"
                    )}
                  />
                  조명·냉난방{" "}
                  {sharedPower.failed ? "제어 실패" : sharedPower.on === null ? "상태 기록 없음" : sharedPower.on ? "ON" : "OFF"}
                </span>
              </div>

              <div className={cn("grid grid-cols-2 gap-2 p-3 sm:gap-4 sm:p-5", !adminContext.limitedMenu && "lg:grid-cols-3")}>
                {!adminContext.limitedMenu ? <button
                  type="button"
                  disabled={isSyncing}
                  onClick={() =>
                    void handleStoreControl(
                      sharedPower.on ? "shared_off" : "shared_on",
                      sharedPower.on
                        ? "매장 조명과 냉난방을 끕니다. 타석 장비는 그대로 둡니다. 진행할까요?"
                        : "매장 조명과 냉난방을 켭니다. 타석 장비는 켜지 않습니다. 진행할까요?",
                      sharedPower.on ? "매장 조명·냉난방 OFF" : "매장 조명·냉난방 ON"
                    )
                  }
                  className="col-span-2 rounded-md border border-[#dfe8dc] bg-white p-5 text-left shadow-soft-line transition hover:border-vista-leaf hover:bg-vista-fairway disabled:cursor-not-allowed disabled:opacity-60 lg:col-span-1"
                >
                  <span className="grid size-12 place-items-center rounded-md bg-vista-leaf text-white">
                    <Lightbulb size={22} aria-hidden="true" />
                  </span>
                  <h4 className="mt-4 text-lg font-extrabold">매장 조명 {sharedPower.on ? "OFF" : "ON"}</h4>
                  <p className="mt-2 text-sm leading-6 text-[#697468]">
                    로비·홀 조명과 냉난방만 {sharedPower.on ? "끕니다" : "켭니다"}. 개점·폐점 때 쓰는 버튼입니다.
                  </p>
                </button> : null}

                <button
                  type="button"
                  disabled={isSyncing}
                  onClick={() =>
                    void handleStoreControl(
                      "store_prepare",
                      "조명·냉난방과 모든 타석의 프로젝터·PC를 함께 켭니다.\n\n평소에는 손님이 입장할 때 해당 타석만 자동으로 켜집니다. 단체 예약이나 점검처럼 전체를 미리 켜야 할 때만 사용하세요. 진행할까요?",
                      "매장 전체 준비 ON"
                    )
                  }
                  className="flex min-h-12 items-center justify-center rounded-md border border-[#dfe8dc] bg-white p-2 text-center shadow-soft-line transition hover:border-vista-leaf hover:bg-vista-fairway disabled:cursor-not-allowed disabled:opacity-60 sm:block sm:p-5 sm:text-left"
                >
                  <span className="hidden size-12 place-items-center rounded-md bg-vista-leaf text-white sm:grid">
                    <Zap size={22} aria-hidden="true" />
                  </span>
                  <h4 className="text-[11px] font-extrabold whitespace-nowrap sm:mt-4 sm:text-lg">매장 전체 준비 ON</h4>
                </button>

                <button
                  type="button"
                  disabled={isSyncing}
                  onClick={() =>
                    void handleStoreControl(
                      "store_close",
                      "매장을 종료합니다. 온라인 Agent가 있는 타석 PC를 정상 종료합니다. 매장 제어기가 연결된 경우 프로젝터·타석 장비·조명·냉난방도 함께 끕니다. 이용 중인 고객이 없을 때만 실행됩니다. 진행할까요?",
                      "매장 종료"
                    )
                  }
                  className="flex min-h-12 items-center justify-center rounded-md border border-[#efc7c7] bg-[#fff8f8] p-2 text-center shadow-soft-line transition hover:border-rose-400 disabled:cursor-not-allowed disabled:opacity-60 sm:block sm:p-5 sm:text-left"
                >
                  <span className="hidden size-12 place-items-center rounded-md bg-rose-600 text-white sm:grid">
                    <Power size={22} aria-hidden="true" />
                  </span>
                  <h4 className="text-sm font-extrabold whitespace-nowrap sm:mt-4 sm:text-lg">매장 종료</h4>
                  <p className="mt-2 hidden text-sm leading-6 text-[#697468] sm:block">
                    온라인 Agent가 있는 타석 PC를 정상 종료합니다. 매장 제어기가 연결된 경우 주변 장비와 조명·냉난방도 함께 끕니다.
                  </p>
                </button>
              </div>

              <div className="border-t border-[#edf2ea] px-5 py-3">
                <Link href="/admin/automation" className="text-sm font-extrabold text-vista-leaf hover:underline">
                  타석별 개별 ON/OFF와 제어 기록은 무인제어에서 확인합니다 →
                </Link>
              </div>
            </section>

            <section className="mt-6">
              <div>
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-bold text-vista-leaf">타석 메인</p>
                    <h3 className="text-2xl font-extrabold">실시간 타석 상태</h3>
                  </div>
                  <div className="flex items-center gap-2 rounded-md border border-[#dfe8dc] bg-white px-3 py-2 text-sm font-bold text-vista-leaf shadow-soft-line">
                    <Wifi size={17} aria-hidden="true" />
                    장비 연결 감시 중
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {bays.length > 0 ? (
                    bays.map((bay) => (
                      <BayCard
                        key={bay.id}
                        bay={bay}
                        limitedMenu={adminContext.limitedMenu}
                        onEndSession={handleEndSession}
                        onExtendTime={handleExtendTime}
                        onCheckIn={handleCheckIn}
                        onMaintenanceDone={handleMaintenanceDone}
                      />
                    ))
                  ) : (
                    <div className="rounded-md border border-[#dfe8dc] bg-white p-5 text-sm font-bold text-[#697468] shadow-soft-line md:col-span-2 xl:col-span-3">
                      표시할 타석 데이터가 없습니다. 타석관리에서 시흥점 타석을 등록하거나 Supabase 연결 상태를 확인해주세요.
                    </div>
                  )}
                </div>
              </div>

              <aside className="mt-6 rounded-md border border-[#dfe8dc] bg-white p-5 shadow-soft-line">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-vista-leaf">자동화 및 제어</p>
                    <h3 className="text-xl font-extrabold">실시간 로그</h3>
                  </div>
                  <span className="rounded-md bg-vista-fairway px-3 py-1 text-xs font-extrabold text-vista-leaf">LIVE</span>
                </div>

                <div className="mb-5 grid grid-cols-3 gap-3">
                  <MiniStatus label="전원" value="정상" />
                  <MiniStatus label="냉난방" value="연결" />
                  <MiniStatus label="오늘 예약·입장" value={`${todayReservationSummary.total}건`} />
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  {logs.length > 0 ? (
                    logs.map((log) => (
                      <div key={log.id} className={cn("rounded-md border p-3", logToneClass[log.tone])}>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-extrabold">{log.time} · {log.target}</p>
                          <span className="text-xs font-extrabold">{log.result}</span>
                        </div>
                        <p className="mt-2 text-xs font-semibold opacity-80">{log.event}</p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-md border border-[#e5ece1] bg-[#fbfcfa] p-4 text-sm font-bold text-[#697468]">
                      아직 오늘 기록된 제어 로그가 없습니다.
                    </div>
                  )}
                </div>
              </aside>
            </section>

            <section className={cn("mt-6 grid gap-6", automationDevices.length > 0 && "xl:grid-cols-[1.1fr_0.9fr]")}>
              {automationDevices.length > 0 ? (
                <article className="rounded-md border border-[#dfe8dc] bg-white shadow-soft-line">
                  <div className="border-b border-[#e5ece1] p-5">
                    <h3 className="text-lg font-extrabold">무인 장비 마지막 명령</h3>
                    <p className="mt-1 text-sm text-[#697468]">
                      매장 제어기가 마지막으로 실행한 ON/OFF 명령입니다. 실제 PC 연결 상태는 위 타석 카드에서 확인합니다.
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-sm">
                      <thead className="bg-vista-fairway text-[#566153]">
                        <tr>
                          <th className="px-5 py-3 font-bold">구역</th>
                          <th className="px-5 py-3 font-bold">장비</th>
                          <th className="px-5 py-3 font-bold">연동</th>
                          <th className="px-5 py-3 font-bold">마지막 명령 결과</th>
                          <th className="px-5 py-3 font-bold">마지막 실행</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#edf2ea]">
                        {automationDevices.map((row) => (
                          <tr key={`${row.zone}-${row.device}`} className="hover:bg-[#fbfcfa]">
                            <td className="px-5 py-4 font-extrabold">{row.zone}</td>
                            <td className="px-5 py-4">{row.device}</td>
                            <td className="px-5 py-4">{row.provider}</td>
                            <td
                              className={cn(
                                "px-5 py-4 font-bold",
                                row.tone === "on" && "text-vista-leaf",
                                row.tone === "off" && "text-[#697468]",
                                row.tone === "failed" && "text-rose-700"
                              )}
                            >
                              {row.state}
                            </td>
                            <td className="px-5 py-4 text-[#697468]">
                              {row.lastRunAt ? formatSessionDateTime(row.lastRunAt) : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              ) : null}

              <article className="rounded-md border border-[#dfe8dc] bg-white shadow-soft-line">
                <div className="border-b border-[#e5ece1] p-5">
                  <h3 className="text-lg font-extrabold">오늘 예약·입장 예정</h3>
                  <p className="mt-1 text-sm text-[#697468]">예약과 무예약 입장을 자동화 실행 조건으로 사용합니다.</p>
                </div>
                <div className="divide-y divide-[#edf2ea]">
                  {reservations.length > 0 ? (
                    reservations.map((row) => (
                      <div key={row.id} className="p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-extrabold">{row.time} · {row.member}</p>
                          <span className="rounded-md bg-[#edf6ef] px-2 py-1 text-xs font-bold text-vista-leaf">{row.status}</span>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-[#697468]">
                          {row.bay} · {row.channel} · {row.approval}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="p-5 text-sm font-bold text-[#697468]">오늘 예약·입장 예정이 없습니다.</div>
                  )}
                </div>
              </article>
            </section>

          </div>
        </section>

        {isUsageDetailOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="usage-detail-title"
            onMouseDown={(event) => {
              if (event.currentTarget === event.target) setIsUsageDetailOpen(false);
            }}
          >
            <section className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-md border border-[#d9e3d5] bg-white shadow-2xl">
              <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#e5ece1] bg-white p-5">
                <div>
                  <p className="text-sm font-bold text-vista-leaf">실시간 세션 기준</p>
                  <h2 id="usage-detail-title" className="mt-1 text-2xl font-extrabold">
                    현재 이용·종료 확인 상세
                  </h2>
                  <p className="mt-2 text-sm font-semibold text-[#697468]">
                    현재 이용 {summary.inUse}건 · 종료 확인 {overtimeBays.length}건
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsUsageDetailOpen(false)}
                  className="grid size-11 shrink-0 place-items-center rounded-md border border-[#d9e3d5] bg-white hover:bg-[#f4f7f2]"
                  title="상세 화면 닫기"
                >
                  <X size={21} aria-hidden="true" />
                  <span className="sr-only">닫기</span>
                </button>
              </header>

              <div className="space-y-3 p-5">
                {usageDetailBays.length > 0 ? (
                  usageDetailBays.map((bay) => {
                    const isOvertime = (bay.remainingMinutes ?? 1) <= 0;
                    return (
                      <article
                        key={bay.accessSessionId ?? bay.id}
                        className={cn(
                          "rounded-md border p-4",
                          isOvertime ? "border-rose-300 bg-rose-50" : "border-sky-200 bg-sky-50"
                        )}
                      >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-xl font-extrabold">{bay.name}</h3>
                              <span
                                className={cn(
                                  "rounded-md px-2 py-1 text-xs font-extrabold",
                                  isOvertime ? "bg-rose-600 text-white" : "bg-sky-600 text-white"
                                )}
                              >
                                {isOvertime ? "종료 확인 필요" : `${bay.remainingMinutes ?? "-"}분 남음`}
                              </span>
                            </div>
                            <p className="mt-2 text-sm font-bold text-[#4f5b50]">
                              {bay.customer ?? "현장 고객"} · {getEntryMethodLabel(bay.entryMethod)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleEndSession(bay)}
                            disabled={isSyncing}
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-rose-600 px-4 py-3 text-sm font-extrabold text-white disabled:opacity-50"
                          >
                            <Power size={18} aria-hidden="true" />
                            이용 종료
                          </button>
                        </div>

                        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                          <div className="rounded-md bg-white/85 p-3">
                            <dt className="font-bold text-[#697468]">시작</dt>
                            <dd className="mt-1 font-extrabold">{formatSessionDateTime(bay.startedAtIso)}</dd>
                          </div>
                          <div className="rounded-md bg-white/85 p-3">
                            <dt className="font-bold text-[#697468]">종료 예정</dt>
                            <dd className="mt-1 font-extrabold">{formatSessionDateTime(bay.endsAtIso)}</dd>
                          </div>
                          <div className="rounded-md bg-white/85 p-3">
                            <dt className="font-bold text-[#697468]">세션 상태</dt>
                            <dd className="mt-1 font-extrabold">{bay.sessionStatus ?? "확인 필요"}</dd>
                          </div>
                          <div className="rounded-md bg-white/85 p-3">
                            <dt className="font-bold text-[#697468]">세션 식별</dt>
                            <dd className="mt-1 truncate font-mono text-xs font-bold">{bay.accessSessionId ?? "-"}</dd>
                          </div>
                        </dl>
                      </article>
                    );
                  })
                ) : (
                  <div className="rounded-md border border-[#dfe8dc] bg-[#f7f9f6] p-6 text-center">
                    <CheckCircle2 className="mx-auto text-vista-leaf" size={30} aria-hidden="true" />
                    <p className="mt-3 font-extrabold">현재 이용 중이거나 종료 확인이 필요한 세션이 없습니다.</p>
                  </div>
                )}
              </div>
            </section>
          </div>
        ) : null}

        {toast ? (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-md bg-vista-leaf px-5 py-4 text-sm font-extrabold text-white shadow-soft-line">
            <CheckCircle2 size={19} aria-hidden="true" />
            {toast}
          </div>
        ) : null}
      </div>

      <style>{`
        @keyframes pulse-border {
          0%, 100% { border-color: rgb(252 211 77); }
          50% { border-color: rgb(244 63 94); }
        }
      `}</style>
    </main>
  );
}

function WarningItem({
  title,
  description,
  actionLabel,
  onAction
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
}) {
  return (
    <div className="rounded-md border border-amber-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-extrabold">{title}</p>
          <p className="mt-1 text-sm leading-6 text-[#697468]">{description}</p>
        </div>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="shrink-0 rounded-md bg-vista-leaf px-4 py-2 text-sm font-extrabold text-white"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function BayCard({
  bay,
  limitedMenu,
  onEndSession,
  onExtendTime,
  onCheckIn,
  onMaintenanceDone
}: {
  bay: LiveBay;
  limitedMenu: boolean;
  onEndSession: (bay: LiveBay) => void | Promise<void>;
  onExtendTime: (bay: LiveBay) => void | Promise<void>;
  onCheckIn: (bay: LiveBay) => void | Promise<void>;
  onMaintenanceDone: (bay: LiveBay) => void | Promise<void>;
}) {
  const meta = statusMeta[bay.status];
  const StatusIcon = meta.icon;
  const usageText = getBayUsageText(bay);
  const gameStatus = getGameStatusDisplay(bay);
  const hideUnknownGameStatus = limitedMenu && /^A-0[1-7]$/i.test(bay.name) &&
    (gameStatus.label === "게임 상태 확인 불가" || gameStatus.label === "게임 감지 미지원");

  return (
    <article className={cn("flex h-full flex-col rounded-md border bg-white p-4 shadow-soft-line", meta.card)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className={cn("inline-flex items-center gap-2 rounded-md border px-3 py-1 text-sm font-extrabold", meta.badge)}>
          <span className={cn("size-2 rounded-full", meta.dot)} />
          {meta.label}
        </span>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-extrabold",
              bay.pcOnline
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-gray-300 bg-gray-100 text-gray-500"
            )}
            title={
              bay.pcLastSeenIso
                ? `마지막 신호: ${new Date(bay.pcLastSeenIso).toLocaleString("ko-KR")}`
                : "에이전트 신호 없음"
            }
          >
            <span className={cn("size-2 rounded-full", bay.pcOnline ? "bg-emerald-500" : "bg-gray-400")} />
            PC {bay.pcOnline ? "켜짐" : "확인 안 됨"}
          </span>
          <span className="rounded-md bg-white/80 px-2 py-1 text-xs font-extrabold text-[#697468]">{bay.zone}</span>
        </div>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-2xl font-extrabold">{bay.name}</h4>
          <p className="mt-1 text-sm font-bold text-[#5f6b5e]">{bay.mode}</p>
          {usageText ? <p className="mt-1.5 text-base font-extrabold text-sky-800">{usageText}</p> : null}
        </div>
        <div className={cn("grid size-11 shrink-0 place-items-center rounded-md", meta.iconBox)}>
          <StatusIcon size={23} aria-hidden="true" />
        </div>
      </div>

      {!hideUnknownGameStatus ? <details
        className={cn(
          "group mt-3 rounded-md border px-4 py-2.5 text-base font-bold",
          gameStatus.tone === "active"
            ? "border-sky-200 bg-sky-50 text-sky-800"
            : gameStatus.tone === "idle"
              ? "border-gray-200 bg-white/80 text-gray-600"
              : "border-amber-200 bg-amber-50 text-amber-800"
        )}
      >
        <summary className="flex cursor-pointer list-none items-center gap-2.5">
          <Activity size={20} aria-hidden="true" />
          <span className="min-w-0 flex-1">{gameStatus.label}</span>
          <span className="text-xs font-extrabold opacity-75">
            {bay.gameActivity?.supported ? `오늘 ${bay.gameActivity.todayReturnedToLobby ?? 0}회` : "이력 미지원"}
          </span>
        </summary>
        <div className="mt-2 border-t border-current/15 pt-2 text-xs font-semibold leading-5 opacity-90">
          <p>{gameStatus.detail}</p>
          <p>Agent {bay.agentVersion ?? "버전 확인 불가"}</p>
          {bay.gameActivity?.supported ? (
            bay.gameActivity.recentEvents.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {bay.gameActivity.recentEvents.slice(0, 3).map((event) => (
                  <li key={event.eventId}>
                    {new Date(event.occurredAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                    {event.courseId ? ` · ${event.courseId}` : ""}
                    {event.lastKnownHole ? ` · 마지막 ${event.lastKnownHole}번 홀` : " · 마지막 홀 확인 불가"}
                    {event.delayed ? " · 지연 수신" : ""}
                  </li>
                ))}
              </ul>
            ) : <p className="mt-1">오늘 확인된 일반 코스의 로비 복귀 기록이 없습니다.</p>
          ) : <p className="mt-1">게임 이력 DB 적용 전이거나 조회할 수 없습니다.</p>}
          <p className="mt-1 opacity-75">로비 복귀는 18홀 완주·예약·결제 건수가 아닙니다.</p>
        </div>
      </details> : null}

      {bay.status === "in_use" ? (
        <div className="mt-4 rounded-md border border-white bg-white/80 p-3">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
            <CircularTimer remainingMinutes={bay.remainingMinutes ?? 0} totalMinutes={bay.totalMinutes ?? 120} />
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 text-sm">
              {!limitedMenu ? <InfoBlock label="이용 고객" value={bay.customer ?? "-"} /> : null}
              <InfoBlock label="종료 예정" value={bay.endsAt ?? "-"} />
              <InfoBlock label="시작 시간" value={bay.startedAt ?? "-"} />
              {!limitedMenu ? <InfoBlock label="메모" value={bay.note} /> : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-md border border-white bg-white/80 p-3">
          <p className="text-sm font-bold text-[#697468]">현재 상태</p>
          <p className="mt-2 text-xl font-extrabold">
            {bay.status === "available" && "즉시 사용 가능"}
            {bay.status === "waiting" && "예약자 입장 대기"}
            {bay.status === "maintenance" && "관리자 점검 필요"}
          </p>
        </div>
      )}

      <div className="mt-auto grid grid-cols-1 gap-2 pt-4 sm:grid-cols-2">
        {bay.status === "in_use" ? (
          <>
            <button
              type="button"
              onClick={() => onEndSession(bay)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-rose-600 px-3 py-2.5 text-sm font-extrabold text-white transition hover:bg-rose-500"
            >
              <Power size={18} aria-hidden="true" />
              이용 종료
            </button>
            <button
              type="button"
              onClick={() => onExtendTime(bay)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-vista-leaf px-3 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#3f7357]"
            >
              <PlusCircle size={18} aria-hidden="true" />
              시간 조정
            </button>
          </>
        ) : null}

        {bay.status === "waiting" ? (
          <button
            type="button"
            onClick={() => onCheckIn(bay)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-vista-leaf px-3 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#3f7357] sm:col-span-2"
          >
            <UserCheck size={18} aria-hidden="true" />
            입장 처리 및 세션 시작
          </button>
        ) : null}

        {bay.status === "available" ? (
          <button
            type="button"
            onClick={() => onCheckIn(bay)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#cad8c6] bg-white px-3 py-2.5 text-sm font-extrabold transition hover:bg-vista-fairway sm:col-span-2"
          >
            <UserCheck size={18} aria-hidden="true" />
            관리자 입장 시작
          </button>
        ) : null}

        {bay.status === "maintenance" ? (
          <button
            type="button"
            onClick={() => onMaintenanceDone(bay)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-vista-ink px-3 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#303b34] sm:col-span-2"
          >
            <Wrench size={18} aria-hidden="true" />
            점검 완료 처리
          </button>
        ) : null}
      </div>
    </article>
  );
}

function getGameStatusDisplay(bay: LiveBay) {
  const telemetry = bay.gameTelemetry;
  if (!telemetry) {
    return {
      label: bay.pcOnline ? "게임 감지 미지원" : "게임 상태 확인 불가",
      detail: "이 타석 Agent에서 게임 상태 정보가 아직 수신되지 않았습니다.",
      tone: "unknown" as const
    };
  }

  if (bay.gameTelemetryStale) {
    return {
      label: "게임 상태 확인 불가",
      detail: `마지막 게임 관측: ${new Date(telemetry.observedAt).toLocaleString("ko-KR")}`,
      tone: "unknown" as const
    };
  }

  if (telemetry.gameRunning === false) {
    return {
      label: "골프 프로그램 미실행",
      detail: `프로세스 확인 · ${new Date(telemetry.observedAt).toLocaleString("ko-KR")}`,
      tone: "idle" as const
    };
  }

  if (telemetry.gameRunning !== true) {
    return {
      label: "게임 상태 확인 불가",
      detail: `사유: ${telemetry.reasonCode ?? "unknown"}`,
      tone: "unknown" as const
    };
  }

  if (telemetry.gameState === "practice" || telemetry.gameMode === "practice") {
    return { label: "연습장", detail: "연습장 이용은 일반 코스 복귀 횟수에 포함하지 않습니다.", tone: "active" as const };
  }

  if (telemetry.gameState === "exiting") {
    return { label: "골프 프로그램 종료 중", detail: telemetry.roundStatus === "aborted" ? "라운드 중단이 감지되었습니다." : "프로그램 종료가 감지되었습니다.", tone: "unknown" as const };
  }

  if (telemetry.gameState === "playing") {
    if (telemetry.schemaVersion === 1) {
      return {
        label: "라운드 진행 · 홀 확인 불가",
        detail: `이전 Agent가 라운드 진행을 감지했습니다. 홀 번호는 지원하지 않습니다. · 출처 ${telemetry.stateSource}`,
        tone: "active" as const
      };
    }

    const holeObservedMs = telemetry.holeObservedAt ? Date.parse(telemetry.holeObservedAt) : 0;
    const holeFresh = telemetry.schemaVersion === 2 && telemetry.holeStatus === "confirmed" && holeObservedMs > 0 && Date.now() - holeObservedMs <= 35_000;
    const holeLabel = holeFresh && telemetry.currentHole ? `${telemetry.currentHole}번 홀` : telemetry.holeStatus === "transitioning" ? "홀 확인 중" : "홀 확인 불가";
    return {
      label: `${telemetry.gameMode === "regular" ? "일반 코스" : "게임 화면"} · ${holeLabel}`,
      detail: telemetry.holeObservedAt
        ? `최근 홀 관측 ${new Date(telemetry.holeObservedAt).toLocaleString("ko-KR")} · 출처 ${telemetry.stateSource}`
        : `홀 번호 근거 없음 · 출처 ${telemetry.stateSource}`,
      tone: "active" as const
    };
  }

  if (telemetry.gameState === "menu") {
    return {
      label: "메뉴·대기 화면",
      detail: telemetry.reasonCode === "returned_to_lobby" ? "일반 코스에서 로비로 돌아온 기록입니다. 완주 여부는 확인하지 않습니다." : `출처: ${telemetry.stateSource}`,
      tone: "idle" as const
    };
  }

  if (telemetry.roundStatus === "completed" || telemetry.gameState === "results") {
    return { label: "이전 Agent 종료 신호", detail: "정상 18홀 완주로 집계하지 않는 이전 형식의 신호입니다.", tone: "idle" as const };
  }

  return {
    label: "골프 프로그램 실행 · 플레이 확인 불가",
    detail: `출처: ${telemetry.stateSource} · ${telemetry.reasonCode ?? "상세 상태 없음"}`,
    tone: "active" as const
  };
}

function getBayUsageText(bay: LiveBay) {
  if (bay.status !== "in_use") {
    return "";
  }

  const totalMinutes = bay.totalMinutes;
  const remainingMinutes = bay.remainingMinutes;

  if (typeof totalMinutes === "number" && typeof remainingMinutes === "number") {
    const usedMinutes = Math.max(0, totalMinutes - Math.max(0, remainingMinutes));
    return `${usedMinutes}분 이용 중`;
  }

  if (typeof remainingMinutes === "number") {
    return remainingMinutes <= 0 ? "이용 시간 초과" : `${remainingMinutes}분 남음`;
  }

  return "이용 시간 확인 중";
}

function CircularTimer({ remainingMinutes, totalMinutes }: { remainingMinutes: number; totalMinutes: number }) {
  const safeTotal = Math.max(1, totalMinutes);
  const safeRemaining = Math.max(0, remainingMinutes);
  const remainingRatio = Math.min(1, safeRemaining / safeTotal);
  const dashOffset = RING_CIRCUMFERENCE * (1 - remainingRatio);
  const isOvertime = remainingMinutes <= 0;
  const isUrgent = remainingMinutes > 0 && remainingMinutes <= 10;
  const strokeColor = isOvertime ? "#e11d48" : isUrgent ? "#f59e0b" : VISTA_GREEN;
  const labelColor = isOvertime ? "text-rose-700" : isUrgent ? "text-amber-700" : "text-vista-leaf";

  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: RING_SIZE, height: RING_SIZE }}>
      <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} className="-rotate-90">
        <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} fill="none" stroke="#dfe8dc" strokeWidth="8" />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke={strokeColor}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 0.45s ease, stroke 0.2s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("text-3xl font-extrabold leading-none tabular-nums", labelColor)}>
          {isOvertime ? 0 : safeRemaining}
        </span>
        <span className="mt-1 text-xs font-extrabold text-[#697468]">{isOvertime ? "초과" : "분 남음"}</span>
      </div>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-[#f6f8f5] px-2.5 py-2.5">
      <p className="text-xs font-bold text-[#7a8678]">{label}</p>
      <p className="mt-1 truncate text-sm font-extrabold">{value}</p>
    </div>
  );
}

function MiniStatus({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#e5ece1] bg-[#fbfcfa] p-3">
      <p className="text-xs font-bold text-[#7a8678]">{label}</p>
      <p className="mt-1 text-sm font-extrabold">{value}</p>
    </div>
  );
}
