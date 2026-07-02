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
  LogOut,
  Menu,
  MonitorCog,
  PlusCircle,
  Power,
  Search,
  ShieldCheck,
  UserCheck,
  Wifi,
  Wrench
} from "lucide-react";
import {
  adminAlertRows,
  adminNavItems,
  automationDeviceRows,
  automationLogRows,
  featureChecks,
  liveBayRows,
  noShowRows,
  quickActions,
  reservationRows,
  storeSummaryRows,
  type AdminAlert,
  type ControlLog,
  type LiveBay,
  type LiveBayStatus,
  type LogTone
} from "@/lib/dashboard-data";
import { subscribeToBays, updateBayStatus } from "@/lib/supabase/bays";

const VISTA_GREEN = "#4E8969";
const RING_SIZE = 132;
const RING_RADIUS = 52;
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

type DashboardClientProps = {
  currentStoreId: string;
  initialBays: LiveBay[];
  initialStoreSummaries?: DashboardStoreSummary[];
  initialError?: string | null;
};

type DashboardStoreSummary = {
  id?: string;
  store: string;
  address?: string;
  phone?: string;
  bayCount?: number;
  region?: string;
  reservations?: string;
  status: string;
};

export function DashboardClient({ currentStoreId, initialBays, initialStoreSummaries, initialError = null }: DashboardClientProps) {
  const router = useRouter();
  const [bays, setBays] = useState<LiveBay[]>(initialBays.length > 0 ? initialBays : liveBayRows);
  const [alerts, setAlerts] = useState<AdminAlert[]>(adminAlertRows);
  const [logs, setLogs] = useState<ControlLog[]>(automationLogRows);
  const [now, setNow] = useState<Date | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(initialError);
  const [isSyncing, setIsSyncing] = useState(false);
  const storeSummaries: DashboardStoreSummary[] =
    initialStoreSummaries && initialStoreSummaries.length > 0 ? initialStoreSummaries : storeSummaryRows.map((row) => ({ ...row }));

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setBays(initialBays.length > 0 ? initialBays : liveBayRows);
    setDataError(initialError);
  }, [initialBays, initialError]);

  useEffect(() => {
    try {
      return subscribeToBays((updatedBay) => {
        setBays((current) => {
          const hasBay = current.some((bay) => bay.id === updatedBay.id);

          if (!hasBay) {
            return [...current, updatedBay].sort((a, b) => a.name.localeCompare(b.name, "ko-KR"));
          }

          return current.map((bay) => (bay.id === updatedBay.id ? { ...bay, ...updatedBay } : bay));
        });
        setDataError(null);
      }, currentStoreId);
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "타석 실시간 구독을 시작하지 못했습니다.");
      return undefined;
    }
  }, [currentStoreId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const summary = useMemo(() => {
    const inUse = bays.filter((bay) => bay.status === "in_use").length;
    const waiting = bays.filter((bay) => bay.status === "waiting").length;
    const available = bays.filter((bay) => bay.status === "available").length;
    const maintenance = bays.filter((bay) => bay.status === "maintenance").length;
    const people = bays.reduce((sum, bay) => sum + (bay.status === "in_use" ? bay.people ?? 0 : 0), 0);

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

  const handlePowerOff = async (bay: LiveBay) => {
    setBays((prev) =>
      prev.map((item) =>
        item.id === bay.id
          ? {
              ...item,
              status: "available",
              customer: undefined,
              remainingMinutes: undefined,
              startedAt: undefined,
              endsAt: undefined,
              mode: "즉시 배정 가능",
              note: "관리자 원격 OFF 완료"
            }
          : item
      )
    );
    await syncBayStatus(bay, "available");
    addLog(bay.name, "키오스크 잠금, 조명·냉난방·타석 전원 OFF", "성공", "control");
    setToast(`${bay.name} 장비 전원을 종료했습니다.`);
  };

  const handleExtendTime = async (bay: LiveBay) => {
    setBays((prev) =>
      prev.map((item) =>
        item.id === bay.id && item.status === "in_use"
          ? {
              ...item,
              remainingMinutes: (item.remainingMinutes ?? 0) + 30,
              endsAt: addMinutesToClock(item.endsAt, 30),
              note: "관리자 30분 연장 적용"
            }
          : item
      )
    );
    await syncBayStatus(bay, "in_use");
    addLog(bay.name, "키오스크 이용시간 30분 연장", "성공", "success");
    setToast(`${bay.name} 이용시간을 30분 연장했습니다.`);
  };

  const handleCheckIn = async (bay: LiveBay) => {
    const currentTime = getCurrentTime();
    const dueTime = addMinutesToClock(currentTime, 90) ?? "90분 후";
    const customer = bay.reservationName ?? "현장 고객";

    setBays((prev) =>
      prev.map((item) =>
        item.id === bay.id
          ? {
              ...item,
              status: "in_use",
              customer,
              totalMinutes: 90,
              remainingMinutes: 90,
              startedAt: currentTime,
              endsAt: dueTime,
              mode: "입장 처리 완료",
              note: "키오스크 90분 세션 시작"
            }
          : item
      )
    );
    setAlerts((prev) => prev.filter((alert) => !alert.description.includes(customer.split(" / ")[0])));
    await syncBayStatus(bay, "in_use");
    addLog(bay.name, `${customer} 입장 처리, 장비 자동 ON`, "성공", "success");
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
    { label: "현재 이용 중", value: `${summary.inUse} / ${bays.length}`, helper: `${summary.people}명 플레이 중`, icon: Activity, className: "border-sky-200 bg-sky-50 text-sky-700" },
    { label: "입장 대기", value: `${summary.waiting}`, helper: "키오스크 인증 또는 승인 필요", icon: Clock3, className: "border-amber-200 bg-amber-50 text-amber-700" },
    { label: "사용 가능", value: `${summary.available}`, helper: "즉시 배정 가능한 타석", icon: CheckCircle2, className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
    { label: "점검/알림", value: `${summary.maintenance + alerts.length + noShowRows.length + overtimeBays.length}`, helper: "확인 필요한 항목", icon: AlertTriangle, className: "border-rose-200 bg-rose-50 text-rose-700" },
    { label: "오늘 예약", value: "38", helper: "앱 27건, 현장/전화 11건", icon: CalendarClock, className: "border-slate-200 bg-slate-50 text-slate-700" }
  ];

  const showWarningBanner =
    alerts.length > 0 || soonEndingBays.length > 0 || overtimeBays.length > 0 || noShowRows.length > 0;

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
              {adminNavItems.map((item) => (
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
                    <p className="text-sm font-extrabold">본사관리자</p>
                    <p className="text-xs font-semibold text-[#697468]">본사관리자 권한 적용 완료</p>
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
              <button className="grid size-11 place-items-center rounded-md border border-[#d9e4d6] bg-white text-vista-ink lg:hidden">
                <Menu size={22} aria-hidden="true" />
                <span className="sr-only">메뉴 열기</span>
              </button>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-vista-leaf">비스타파크골프 시흥점</p>
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
                본사관리자
              </div>
              <button className="relative grid size-11 place-items-center rounded-md border border-[#d9e4d6] bg-white text-vista-ink">
                <Bell size={20} aria-hidden="true" />
                {showWarningBanner ? <span className="absolute right-2 top-2 size-2 rounded-full bg-rose-500" /> : null}
                <span className="sr-only">알림</span>
              </button>
            </div>
          </header>

          <div className="px-4 py-6 sm:px-6 lg:px-8">
            {dataError ? (
              <section className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-900 shadow-soft-line">
                Supabase 연결 안내: {dataError} 현재 화면은 기존 샘플 데이터로 계속 표시됩니다.
              </section>
            ) : null}

            {isSyncing ? (
              <section className="mb-5 rounded-md border border-vista-mint bg-vista-fairway px-5 py-4 text-sm font-bold text-vista-leaf shadow-soft-line">
                Supabase에 타석 상태를 저장하는 중입니다.
              </section>
            ) : null}

            <section className="rounded-md border border-[#d9e3d5] bg-white p-5 shadow-soft-line sm:p-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <p className="text-sm font-bold text-vista-leaf">VISTA Park Golf Connect</p>
                  <h3 className="mt-2 text-2xl font-extrabold tracking-normal sm:text-3xl">
                    타석 예약, 입장 인증, 키오스크 시간, 장비 전원을 한 화면에서 관리합니다
                  </h3>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-[#5f6b5e]">
                    1차 MVP는 출입문 제어를 제외하고 고객 예약 또는 현장 입장 승인 후 조명, 냉난방, 키오스크,
                    타석 전원을 자동으로 준비하고 종료하는 매장관리 흐름에 집중합니다.
                  </p>
                </div>
                <div className="rounded-md border border-vista-mint bg-vista-fairway px-4 py-3 text-sm font-bold text-vista-leaf">
                  출입문 제어는 안전 검토 후 2차 기능
                </div>
              </div>
            </section>

            <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-label="주요 지표">
              {metrics.map((item) => {
                const Icon = item.icon;
                return (
                  <article key={item.label} className="rounded-md border border-[#dfe8dc] bg-white p-5 shadow-soft-line">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-[#697468]">{item.label}</p>
                        <strong className="mt-2 block text-3xl font-extrabold">{item.value}</strong>
                      </div>
                      <span className={cn("grid size-11 place-items-center rounded-md border", item.className)}>
                        <Icon size={21} aria-hidden="true" />
                      </span>
                    </div>
                    <p className="mt-4 text-sm font-semibold text-[#5f6b5e]">{item.helper}</p>
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
                    {alerts.length + soonEndingBays.length + overtimeBays.length + noShowRows.length}건
                  </span>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {overtimeBays.map((bay) => (
                    <WarningItem
                      key={`overtime-${bay.id}`}
                      title={`${bay.name} 미퇴장 확인 필요`}
                      description={`${bay.customer ?? "이용 고객"}의 이용 시간이 초과되었습니다. 퇴장 안내 또는 추가 연장 처리가 필요합니다.`}
                      actionLabel="장비 OFF"
                      onAction={() => handlePowerOff(bay)}
                    />
                  ))}
                  {soonEndingBays.map((bay) => (
                    <WarningItem
                      key={`soon-${bay.id}`}
                      title={`${bay.name} 이용시간 종료 임박`}
                      description={`${bay.customer ?? "이용 고객"}의 남은 시간이 ${bay.remainingMinutes}분입니다. 연장 또는 종료 안내가 필요합니다.`}
                      actionLabel="30분 연장"
                      onAction={() => handleExtendTime(bay)}
                    />
                  ))}
                  {noShowRows.map((row) => (
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

            <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="빠른 작업">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={action.label}
                    href={action.href}
                    className="rounded-md border border-[#dfe8dc] bg-white p-5 shadow-soft-line transition hover:border-vista-leaf hover:bg-vista-fairway"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="grid size-12 place-items-center rounded-md bg-vista-leaf text-white">
                        <Icon size={22} aria-hidden="true" />
                      </span>
                      <ArrowRight size={18} className="text-[#7a8678]" aria-hidden="true" />
                    </div>
                    <h3 className="mt-4 text-lg font-extrabold">{action.label}</h3>
                    <p className="mt-2 text-sm leading-6 text-[#697468]">{action.description}</p>
                  </Link>
                );
              })}
            </section>

            <section className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
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

                <div className="grid gap-4 md:grid-cols-2">
                  {bays.map((bay) => (
                    <BayCard
                      key={bay.id}
                      bay={bay}
                      onPowerOff={handlePowerOff}
                      onExtendTime={handleExtendTime}
                      onCheckIn={handleCheckIn}
                      onMaintenanceDone={handleMaintenanceDone}
                    />
                  ))}
                </div>
              </div>

              <aside className="rounded-md border border-[#dfe8dc] bg-white p-5 shadow-soft-line">
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
                  <MiniStatus label="키오스크" value="3건" />
                </div>

                <div className="space-y-3">
                  {logs.map((log) => (
                    <div key={log.id} className={cn("rounded-md border p-3", logToneClass[log.tone])}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-extrabold">{log.time} · {log.target}</p>
                        <span className="text-xs font-extrabold">{log.result}</span>
                      </div>
                      <p className="mt-2 text-xs font-semibold opacity-80">{log.event}</p>
                    </div>
                  ))}
                </div>
              </aside>
            </section>

            <section className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <article className="rounded-md border border-[#dfe8dc] bg-white shadow-soft-line">
                <div className="border-b border-[#e5ece1] p-5">
                  <h3 className="text-lg font-extrabold">무인 장비 상태</h3>
                  <p className="mt-1 text-sm text-[#697468]">조명, 냉난방기, 키오스크, 타석 전원의 현재 상태입니다.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-vista-fairway text-[#566153]">
                      <tr>
                        <th className="px-5 py-3 font-bold">구역</th>
                        <th className="px-5 py-3 font-bold">장비</th>
                        <th className="px-5 py-3 font-bold">연동</th>
                        <th className="px-5 py-3 font-bold">상태</th>
                        <th className="px-5 py-3 font-bold">다음 동작</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#edf2ea]">
                      {automationDeviceRows.map((row) => (
                        <tr key={`${row.zone}-${row.device}`} className="hover:bg-[#fbfcfa]">
                          <td className="px-5 py-4 font-extrabold">{row.zone}</td>
                          <td className="px-5 py-4">{row.device}</td>
                          <td className="px-5 py-4">{row.type}</td>
                          <td className="px-5 py-4 font-bold text-vista-leaf">{row.state}</td>
                          <td className="px-5 py-4 text-[#697468]">{row.action}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="rounded-md border border-[#dfe8dc] bg-white shadow-soft-line">
                <div className="border-b border-[#e5ece1] p-5">
                  <h3 className="text-lg font-extrabold">오늘 예약·입장 예정</h3>
                  <p className="mt-1 text-sm text-[#697468]">예약과 무예약 입장을 자동화 실행 조건으로 사용합니다.</p>
                </div>
                <div className="divide-y divide-[#edf2ea]">
                  {reservationRows.map((row) => (
                    <div key={`${row.time}-${row.member}`} className="p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-extrabold">{row.time} · {row.member}</p>
                        <span className="rounded-md bg-[#edf6ef] px-2 py-1 text-xs font-bold text-vista-leaf">{row.status}</span>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-[#697468]">
                        {row.bay} · {row.channel} · {row.approval}
                      </p>
                    </div>
                  ))}
                </div>
              </article>
            </section>

            <section className="mt-6 grid gap-6 xl:grid-cols-2">
              <article className="rounded-md border border-[#dfe8dc] bg-white p-5 shadow-soft-line">
                <h3 className="text-lg font-extrabold">본사 매장 현황</h3>
                <div className="mt-4 grid gap-3">
                  {storeSummaries.map((row) => (
                    <div key={row.store} className="rounded-md bg-[#fbfcfa] p-3 ring-1 ring-[#e5ece1]">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-extrabold">{row.store}</p>
                        <span className="text-xs font-bold text-vista-leaf">{row.status}</span>
                      </div>
                      <p className="mt-2 text-xs font-semibold text-[#697468]">
                        {row.address ?? row.region ?? "주소 미등록"} · 타석 {row.bayCount ?? row.reservations ?? 0}
                        {row.phone ? ` · ${row.phone}` : ""}
                      </p>
                      <p className="hidden">
                        {row.region} · 오늘 예약 {row.reservations}
                      </p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="rounded-md border border-[#dfe8dc] bg-white p-5 shadow-soft-line">
                <h3 className="text-lg font-extrabold">무인 운영 1차 MVP 범위</h3>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {featureChecks.slice(0, 8).map(([name, status]) => (
                    <div key={name} className="flex gap-3 rounded-md bg-[#fbfcfa] p-3 ring-1 ring-[#e5ece1]">
                      <CheckCircle2 className="mt-0.5 shrink-0 text-vista-leaf" size={18} aria-hidden="true" />
                      <div>
                        <p className="text-sm font-extrabold">{name}</p>
                        <p className="mt-1 text-xs font-semibold text-[#697468]">{status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </section>
          </div>
        </section>

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
  onPowerOff,
  onExtendTime,
  onCheckIn,
  onMaintenanceDone
}: {
  bay: LiveBay;
  onPowerOff: (bay: LiveBay) => void | Promise<void>;
  onExtendTime: (bay: LiveBay) => void | Promise<void>;
  onCheckIn: (bay: LiveBay) => void | Promise<void>;
  onMaintenanceDone: (bay: LiveBay) => void | Promise<void>;
}) {
  const meta = statusMeta[bay.status];
  const StatusIcon = meta.icon;

  return (
    <article className={cn("rounded-md border bg-white p-5 shadow-soft-line", meta.card)}>
      <div className="mb-4 flex items-center justify-between">
        <span className={cn("inline-flex items-center gap-2 rounded-md border px-3 py-1 text-sm font-extrabold", meta.badge)}>
          <span className={cn("size-2 rounded-full", meta.dot)} />
          {meta.label}
        </span>
        <span className="rounded-md bg-white/80 px-2 py-1 text-xs font-extrabold text-[#697468]">{bay.zone}</span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-3xl font-extrabold">{bay.name}</h4>
          <p className="mt-2 text-sm font-bold text-[#5f6b5e]">{bay.mode}</p>
        </div>
        <div className={cn("grid size-14 shrink-0 place-items-center rounded-md", meta.iconBox)}>
          <StatusIcon size={28} aria-hidden="true" />
        </div>
      </div>

      {bay.status === "in_use" ? (
        <div className="mt-5 rounded-md border border-white bg-white/80 p-4">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
            <CircularTimer remainingMinutes={bay.remainingMinutes ?? 0} totalMinutes={bay.totalMinutes ?? 120} />
            <div className="grid flex-1 grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <InfoBlock label="이용 고객" value={bay.customer ?? "-"} />
              <InfoBlock label="종료 예정" value={bay.endsAt ?? "-"} />
              <InfoBlock label="시작 시간" value={bay.startedAt ?? "-"} />
              <InfoBlock label="메모" value={bay.note} />
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-5 rounded-md border border-white bg-white/80 p-4">
          <p className="text-sm font-bold text-[#697468]">현재 상태</p>
          <p className="mt-2 text-xl font-extrabold">
            {bay.status === "available" && "즉시 사용 가능"}
            {bay.status === "waiting" && "예약자 입장 대기"}
            {bay.status === "maintenance" && "관리자 점검 필요"}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <InfoBlock label={bay.status === "waiting" ? "예약자" : "다음 예약"} value={bay.status === "waiting" ? bay.reservationName ?? "-" : bay.nextReservation ?? "-"} />
            <InfoBlock label="메모" value={bay.note} />
          </div>
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {bay.status === "in_use" ? (
          <>
            <button
              type="button"
              onClick={() => onPowerOff(bay)}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-rose-600 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-rose-500"
            >
              <Power size={18} aria-hidden="true" />
              장비 OFF
            </button>
            <button
              type="button"
              onClick={() => onExtendTime(bay)}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-vista-leaf px-4 py-3 text-sm font-extrabold text-white transition hover:bg-[#3f7357]"
            >
              <PlusCircle size={18} aria-hidden="true" />
              30분 연장
            </button>
          </>
        ) : null}

        {bay.status === "waiting" ? (
          <button
            type="button"
            onClick={() => onCheckIn(bay)}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-vista-leaf px-4 py-3 text-sm font-extrabold text-white transition hover:bg-[#3f7357] sm:col-span-2"
          >
            <UserCheck size={18} aria-hidden="true" />
            입장 처리 및 세션 시작
          </button>
        ) : null}

        {bay.status === "available" ? (
          <Link
            href="/admin/automation"
            className="inline-flex items-center justify-center gap-2 rounded-md border border-[#cad8c6] bg-white px-4 py-3 text-sm font-extrabold transition hover:bg-vista-fairway sm:col-span-2"
          >
            <MonitorCog size={18} aria-hidden="true" />
            현장 입장 배정
          </Link>
        ) : null}

        {bay.status === "maintenance" ? (
          <button
            type="button"
            onClick={() => onMaintenanceDone(bay)}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-vista-ink px-4 py-3 text-sm font-extrabold text-white transition hover:bg-[#303b34] sm:col-span-2"
          >
            <Wrench size={18} aria-hidden="true" />
            점검 완료 처리
          </button>
        ) : null}
      </div>
    </article>
  );
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
        <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} fill="none" stroke="#dfe8dc" strokeWidth="10" />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke={strokeColor}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 0.45s ease, stroke 0.2s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("text-4xl font-extrabold leading-none tabular-nums", labelColor)}>
          {isOvertime ? 0 : safeRemaining}
        </span>
        <span className="mt-1 text-xs font-extrabold text-[#697468]">{isOvertime ? "초과" : "분 남음"}</span>
      </div>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-[#f6f8f5] px-3 py-3">
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
