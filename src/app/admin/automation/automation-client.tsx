"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ListChecks,
  Loader2,
  Monitor,
  Power,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  Timer,
  Zap
} from "lucide-react";

type SessionRow = {
  id: string;
  bay: string;
  customer: string;
  startedAt: string;
  endsAt: string;
  remainingMinutes: number | null;
  expired: boolean;
  status: string;
};

type LogRow = { id: string; time: string; title: string; detail: string; status: string };

type BayControlRow = {
  id: string;
  code: string;
  name: string;
  pcName: string | null;
  agentOnline: boolean;
  lastSeenAt: string | null;
  hasAutomation: boolean;
  /** 제어기 실행 기록 기준 마지막 ON/OFF 명령. null 이면 실행 이력 없음 */
  powerOn: boolean | null;
  powerFailed: boolean;
  powerLastRunAt: string | null;
  inUse: boolean;
};

type AutomationStatus = {
  controllerEnabled: boolean;
  controllerStalled: boolean;
  pendingCommandCount: number;
  stalePendingCount: number;
  oldestPendingAt: string | null;
  sessions: SessionRow[];
  logs: LogRow[];
  bays: BayControlRow[];
  schedule: {
    enabled: boolean;
    openTime: string | null;
    closeTime: string | null;
    timezone: string;
    lastOpenedOn: string | null;
    lastClosedOn: string | null;
  } | null;
  scheduleAvailable: boolean;
};

type ApiResponse = { ok?: boolean; message?: string; requiresForce?: boolean };

const DEFAULT_OPEN_TIME = "06:00";
const DEFAULT_CLOSE_TIME = "23:00";

function remainingLabel(session: SessionRow) {
  if (session.remainingMinutes === null) return "시간 확인 필요";
  if (session.remainingMinutes <= 0) return `${Math.abs(session.remainingMinutes)}분 초과`;
  return `${session.remainingMinutes}분 남음`;
}

function BayControls({
  bay,
  pcDisabled,
  equipmentDisabled,
  pcPending,
  equipmentPending,
  onPcToggle,
  onEquipmentCommand
}: {
  bay: BayControlRow;
  pcDisabled: boolean;
  equipmentDisabled: boolean;
  pcPending: boolean;
  equipmentPending: boolean;
  onPcToggle: (turnOn: boolean) => void;
  onEquipmentCommand: (turnOn: boolean) => void;
}) {
  const pcOn = bay.agentOnline;
  const lastEquipmentCommandOn = bay.powerOn === true;
  const stateLabel = bay.powerFailed
    ? lastEquipmentCommandOn
      ? "마지막 ON 명령 실패"
      : "마지막 OFF 명령 실패"
    : bay.powerOn === null
      ? "장비 명령 기록 없음"
      : lastEquipmentCommandOn
        ? "마지막 장비 명령 ON"
        : "마지막 장비 명령 OFF";

  return (
    <div className="mt-4 border-t border-[#e5ece1] pt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-extrabold">PC 전원</p>
          <p className={`mt-0.5 text-xs font-bold ${pcOn ? "text-emerald-700" : "text-[#8a9488]"}`}>
            {pcOn ? "Agent 연결 · 켜짐" : "Agent 신호 없음 · 상태 확인 필요"}
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={pcOn}
          aria-label={`${bay.code} PC ${pcOn ? "정상 종료" : "켜기"}`}
          disabled={pcDisabled || pcPending}
          onClick={() => onPcToggle(!pcOn)}
          className={`relative inline-flex h-9 w-16 shrink-0 items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50 ${
            pcOn ? "border-vista-leaf bg-vista-leaf" : "border-[#cad8c6] bg-[#e8ece7]"
          }`}
        >
          <span
            className={`grid size-7 place-items-center rounded-full bg-white shadow transition-transform ${
              pcOn ? "translate-x-8" : "translate-x-1"
            }`}
          >
            {pcPending ? (
              <Loader2 size={15} className="animate-spin text-[#697468]" />
            ) : (
              <Power size={15} className={pcOn ? "text-vista-leaf" : "text-[#8a9488]"} />
            )}
          </span>
        </button>
      </div>

      {bay.inUse && (
        <p className="mt-2 rounded-md bg-[#fff4eb] px-2.5 py-1.5 text-xs font-bold text-[#9a561a]">
          고객 이용 중 · 끄면 이용에 지장이 있습니다
        </p>
      )}

      <div className="mt-4 rounded-md bg-white p-3 ring-1 ring-[#e5ece1]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={`text-xs font-extrabold ${bay.powerFailed ? "text-rose-700" : "text-[#697468]"}`}>
              {stateLabel}
            </p>
            <p className="mt-1 text-[11px] font-semibold leading-4 text-[#8a9488]">
              {bay.powerLastRunAt
                ? `${new Date(bay.powerLastRunAt).toLocaleString("ko-KR")} · 실제 전원 상태가 아닌 명령 기록`
                : "제어 기록 없음"}
            </p>
          </div>
          {equipmentPending ? <Loader2 size={16} className="shrink-0 animate-spin text-vista-leaf" /> : null}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={equipmentDisabled || equipmentPending}
            onClick={() => onEquipmentCommand(true)}
            className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-2 text-xs font-extrabold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            장비 ON
          </button>
          <button
            type="button"
            disabled={equipmentDisabled || equipmentPending}
            onClick={() => onEquipmentCommand(false)}
            className="rounded-md border border-[#d5ddd3] bg-white px-2 py-2 text-xs font-extrabold text-[#697468] disabled:cursor-not-allowed disabled:opacity-50"
          >
            장비 OFF
          </button>
        </div>
      </div>
    </div>
  );
}

export function AutomationClient() {
  const [status, setStatus] = useState<AutomationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [openTime, setOpenTime] = useState(DEFAULT_OPEN_TIME);
  const [closeTime, setCloseTime] = useState(DEFAULT_CLOSE_TIME);
  const scheduleLoaded = useRef(false);

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/automation", { cache: "no-store" });
      const data = (await response.json()) as AutomationStatus & ApiResponse;
      if (!response.ok || data.ok === false) throw new Error(data.message ?? "무인제어 현황을 불러오지 못했습니다.");
      setStatus(data);
      if (!scheduleLoaded.current && data.schedule) {
        setScheduleEnabled(data.schedule.enabled);
        setOpenTime(data.schedule.openTime ?? DEFAULT_OPEN_TIME);
        setCloseTime(data.schedule.closeTime ?? DEFAULT_CLOSE_TIME);
        scheduleLoaded.current = true;
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "무인제어 현황을 불러오지 못했습니다.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(false), 15_000);
    return () => window.clearInterval(interval);
  }, [load]);

  async function run(
    action: "close_expired" | "shared_on" | "shared_off" | "store_close" | "bay_off" | "bay_on" | "pc_shutdown",
    confirmation: string,
    bayId?: string,
    busyKey?: string
  ) {
    if (!window.confirm(confirmation)) return;

    setBusy(busyKey ?? action);
    setMessage(null);
    setError(null);
    try {
      const send = (force: boolean) =>
        fetch("/api/admin/automation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, bayId, force })
        });

      let response = await send(false);
      let data = (await response.json()) as ApiResponse;

      // 이용 중인 타석을 끄려 하면 서버가 한 번 막는다. 한 번 더 확인받고 강제로 진행한다.
      if (!response.ok && data.requiresForce) {
        if (!window.confirm(`${data.message ?? "이용 중인 타석입니다."}\n\n그래도 장비를 끌까요?`)) {
          setBusy(null);
          return;
        }
        response = await send(true);
        data = (await response.json()) as ApiResponse;
      }

      if (!response.ok || data.ok === false) throw new Error(data.message ?? "처리에 실패했습니다.");
      setMessage(data.message ?? "처리가 완료되었습니다.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "처리 중 오류가 발생했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function saveSchedule() {
    setBusy("save_schedule");
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_schedule", enabled: scheduleEnabled, openTime, closeTime })
      });
      const data = (await response.json()) as ApiResponse;
      if (!response.ok || data.ok === false) throw new Error(data.message ?? "운영시간을 저장하지 못했습니다.");
      setMessage(data.message ?? "운영시간을 저장했습니다.");
      await load(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "운영시간을 저장하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  const expiredCount = status?.sessions.filter((session) => session.expired).length ?? 0;
  const controllerReady = Boolean(status?.controllerEnabled && !status?.controllerStalled);
  const onlinePcCount = status?.bays.filter((bay) => bay.agentOnline).length ?? 0;
  const inUseAgentProblems = status?.bays.filter((bay) => bay.inUse && !bay.agentOnline).length ?? 0;
  const failedEquipmentCommands = status?.bays.filter((bay) => bay.powerFailed).length ?? 0;
  const controllerProblem = Boolean(status && (!status.controllerEnabled || status.controllerStalled));
  const issueCount =
    (controllerProblem ? 1 : 0) + expiredCount + inUseAgentProblems + failedEquipmentCommands;
  const operationsHealthy = Boolean(status && issueCount === 0);

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <section className="rounded-md border border-[#dfe8dc] bg-white p-6 shadow-soft-line">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-bold text-vista-leaf">무인 매장 제어</p>
              <h1 className="mt-1 text-3xl font-extrabold">운영 상태 감시와 장비 제어</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#697468]">
                PC 연결, 장비 제어 명령, 이용 세션을 서로 다른 기준으로 확인하고 필요한 조치를 실행합니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-[#cad8c6] bg-white px-4 py-3 text-sm font-extrabold text-vista-leaf disabled:opacity-60"
              disabled={loading}
            >
              <RefreshCw size={17} className={loading ? "animate-spin" : ""} /> 상태 새로고침
            </button>
          </div>
        </section>

        <section
          className={`mt-5 flex items-start justify-between gap-4 rounded-md border-l-4 p-4 shadow-soft-line ${
            operationsHealthy
              ? "border border-emerald-200 border-l-emerald-500 bg-emerald-50 text-emerald-900"
              : "border border-amber-200 border-l-amber-500 bg-amber-50 text-amber-950"
          }`}
        >
          <div className="flex items-start gap-3">
            {!status ? (
              <Loader2 size={23} className="mt-0.5 shrink-0 animate-spin text-[#697468]" />
            ) : operationsHealthy ? (
              <CheckCircle2 size={23} className="mt-0.5 shrink-0 text-emerald-700" />
            ) : (
              <AlertTriangle size={23} className="mt-0.5 shrink-0 text-amber-700" />
            )}
            <div>
              <p className="font-extrabold">
                {!status
                  ? "운영 상태를 불러오는 중입니다"
                  : operationsHealthy
                    ? "현재 확인이 필요한 운영 문제가 없습니다"
                    : `확인 필요한 운영 항목 ${issueCount}건`}
              </p>
              <p className="mt-1 text-xs font-semibold opacity-80">
                {!status
                  ? "매장 제어기와 타석 PC의 최근 상태를 확인하고 있습니다."
                  : operationsHealthy
                  ? "PC Agent와 장비 명령 기록, 이용시간을 15초마다 확인합니다."
                  : "제어기 응답, 이용 중 PC 연결, 실패한 장비 명령과 종료 초과 이용을 확인해주세요."}
              </p>
            </div>
          </div>
          <span className="shrink-0 text-xs font-bold opacity-70">자동 갱신 15초</span>
        </section>

        <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="운영 상태 요약">
          <article className="rounded-md border border-[#dfe8dc] bg-white p-4 shadow-soft-line">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-sm font-bold text-[#697468]">매장 제어기</p><strong className="mt-2 block text-xl font-extrabold">{controllerReady ? "사용 가능" : status?.controllerStalled ? "응답 지연" : "확인 필요"}</strong></div>
              <span className={`grid size-10 place-items-center rounded-md ${controllerReady ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}><Server size={20} /></span>
            </div>
            <p className="mt-3 text-xs font-semibold text-[#697468]">HA 노트북 명령 전달 경로</p>
          </article>
          <article className="rounded-md border border-[#dfe8dc] bg-white p-4 shadow-soft-line">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-sm font-bold text-[#697468]">장비 명령 대기</p><strong className="mt-2 block text-xl font-extrabold">{status ? `${status.pendingCommandCount}건` : "-"}</strong></div>
              <span className={`grid size-10 place-items-center rounded-md ${status?.controllerStalled ? "bg-rose-50 text-rose-700" : "bg-sky-50 text-sky-700"}`}><ListChecks size={20} /></span>
            </div>
            <p className="mt-3 text-xs font-semibold text-[#697468]">30초 초과 {status?.stalePendingCount ?? 0}건</p>
          </article>
          <article className="rounded-md border border-[#dfe8dc] bg-white p-4 shadow-soft-line">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-sm font-bold text-[#697468]">PC Agent 연결</p><strong className="mt-2 block text-xl font-extrabold">{status ? `${onlinePcCount} / ${status.bays.length}` : "-"}</strong></div>
              <span className="grid size-10 place-items-center rounded-md bg-emerald-50 text-emerald-700"><Monitor size={20} /></span>
            </div>
            <p className="mt-3 text-xs font-semibold text-[#697468]">최근 2분 신호 기준</p>
          </article>
          <article className="rounded-md border border-[#dfe8dc] bg-white p-4 shadow-soft-line">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-sm font-bold text-[#697468]">현재 이용 세션</p><strong className="mt-2 block text-xl font-extrabold">{status ? `${status.sessions.length}건` : "-"}</strong></div>
              <span className={`grid size-10 place-items-center rounded-md ${expiredCount > 0 ? "bg-amber-50 text-amber-700" : "bg-vista-fairway text-vista-leaf"}`}><Activity size={20} /></span>
            </div>
            <p className="mt-3 text-xs font-semibold text-[#697468]">종료 초과 {expiredCount}건</p>
          </article>
        </section>

        {status?.controllerStalled && (
          <div className="mt-4 flex items-start gap-3 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800">
            <AlertTriangle size={20} className="mt-0.5 shrink-0" />
            <div>
              <p>HA 노트북의 VISTA Store Controller가 명령을 가져가지 않고 있습니다.</p>
              <p className="mt-1 text-xs font-semibold text-rose-700">
                대기 명령 {status.stalePendingCount}건
                {status.oldestPendingAt ? ` · 최초 대기 ${new Date(status.oldestPendingAt).toLocaleString("ko-KR")}` : ""}
                {" · 제어기를 확인하기 전에는 새 장비 명령을 보내지 않습니다."}
              </p>
            </div>
          </div>
        )}

        {(message || error) && (
          <div className={`mt-5 flex items-start gap-3 rounded-md border p-4 text-sm font-bold ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
            {error ? <AlertTriangle size={20} className="shrink-0" /> : <CheckCircle2 size={20} className="shrink-0" />}
            <p>{error ?? message}</p>
          </div>
        )}

        <section className="mt-5 rounded-md border border-[#dfe8dc] bg-white shadow-soft-line">
          <div className="flex flex-col gap-4 border-b border-[#e5ece1] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-md bg-vista-fairway text-vista-leaf">
                <CalendarClock size={22} />
              </span>
              <div>
                <p className="text-sm font-bold text-vista-leaf">매장 운영시간</p>
                <h2 className="mt-1 text-xl font-extrabold">PC·프로젝터 자동 시작과 종료</h2>
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-3 text-sm font-extrabold">
              <input
                type="checkbox"
                checked={scheduleEnabled}
                onChange={(event) => setScheduleEnabled(event.target.checked)}
                className="size-5 accent-vista-leaf"
                disabled={busy !== null || status?.scheduleAvailable === false}
              />
              자동제어 사용
            </label>
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="grid gap-2 text-sm font-extrabold text-[#4f5b50]">
              매장 시작 시간
              <input
                type="time"
                value={openTime}
                onChange={(event) => setOpenTime(event.target.value)}
                min="00:00"
                max="23:59"
                step={60}
                className="h-11 rounded-md border border-[#cad8c6] bg-white px-3 text-base font-bold text-vista-ink"
                disabled={busy !== null || status?.scheduleAvailable === false}
              />
            </label>
            <label className="grid gap-2 text-sm font-extrabold text-[#4f5b50]">
              매장 종료 시간
              <input
                type="time"
                value={closeTime}
                onChange={(event) => setCloseTime(event.target.value)}
                min="00:00"
                max="23:59"
                step={60}
                className="h-11 rounded-md border border-[#cad8c6] bg-white px-3 text-base font-bold text-vista-ink"
                disabled={busy !== null || status?.scheduleAvailable === false}
              />
            </label>
            <button
              type="button"
              onClick={() => void saveSchedule()}
              disabled={busy !== null || status?.scheduleAvailable === false}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-vista-leaf px-5 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === "save_schedule" ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
              저장
            </button>
          </div>
          {status?.scheduleAvailable === false ? (
            <p className="border-t border-amber-200 bg-amber-50 px-5 py-3 text-sm font-bold text-amber-800">
              운영시간 DB 설정이 아직 적용되지 않았습니다.
            </p>
          ) : status?.schedule?.enabled ? (
            <p className="border-t border-[#e5ece1] px-5 py-3 text-xs font-semibold text-[#697468]">
              최근 자동 시작 {status.schedule.lastOpenedOn ?? "기록 없음"} · 최근 자동 종료 {status.schedule.lastClosedOn ?? "기록 없음"}
            </p>
          ) : null}
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-3">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void run("close_expired", "종료 시간이 지난 이용만 정리합니다. 진행할까요?")}
            className="rounded-md border border-[#e7ca97] bg-[#fffaf0] p-5 text-left shadow-soft-line transition hover:border-[#bf8429] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="grid size-12 place-items-center rounded-md bg-[#bd7b18] text-white"><Timer size={22} /></span>
            <h2 className="mt-4 text-lg font-extrabold">이용 종료 정리</h2>
            <p className="mt-2 text-sm leading-6 text-[#697468]">종료 초과 {expiredCount}건을 확인하고 타석을 반납합니다.</p>
          </button>

          <button
            type="button"
            disabled={busy !== null || !controllerReady}
            onClick={() => void run("shared_on", "공용 조명과 냉난방 준비 명령을 보냅니다. 실행할까요?")}
            className="rounded-md border border-[#dfe8dc] bg-white p-5 text-left shadow-soft-line transition hover:border-vista-leaf hover:bg-vista-fairway disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="grid size-12 place-items-center rounded-md bg-vista-leaf text-white"><Zap size={22} /></span>
            <h2 className="mt-4 text-lg font-extrabold">매장 준비 ON</h2>
            <p className="mt-2 text-sm leading-6 text-[#697468]">매장 노트북 제어기에 공용 장비 준비를 요청합니다.</p>
          </button>

          <button
            type="button"
            disabled={busy !== null || !controllerReady}
            onClick={() =>
              void run(
                "store_close",
                "매장을 종료합니다. 타석 PC를 정상 종료하고, 모든 타석 장비와 공용 조명·냉난방을 끕니다. 이용 중인 고객이 없을 때만 실행됩니다. 진행할까요?"
              )
            }
            className="rounded-md border border-[#efc7c7] bg-[#fff8f8] p-5 text-left shadow-soft-line transition hover:border-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="grid size-12 place-items-center rounded-md bg-rose-600 text-white"><Power size={22} /></span>
            <h2 className="mt-4 text-lg font-extrabold">매장 종료</h2>
            <p className="mt-2 text-sm leading-6 text-[#697468]">타석 PC를 정상 종료한 뒤 모든 장비와 공용 조명·냉난방을 순서대로 종료합니다.</p>
          </button>
        </section>

        <section className="mt-6 rounded-md border border-[#dfe8dc] bg-white shadow-soft-line">
          <div className="border-b border-[#e5ece1] p-5">
            <p className="text-sm font-bold text-vista-leaf">타석 PC 연결 상태</p>
            <h2 className="mt-1 text-xl font-extrabold">PC 실제 연결과 장비 마지막 명령</h2>
            <p className="mt-2 text-sm leading-6 text-[#697468]">
              PC 상태는 Agent 최근 신호로 확인합니다. 프로젝터·타석 장비는 실제 전원이 아니라 매장 제어기가 마지막으로 실행한 ON/OFF 명령을 표시합니다.
            </p>
          </div>
          <div className="grid gap-3 p-5 md:grid-cols-3">
            {status?.bays.map((bay) => (
              <article key={bay.id} className="rounded-md border border-[#e5ece1] bg-[#fbfcfa] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-extrabold">{bay.code}</p>
                    <p className="mt-1 text-xs font-bold text-[#697468]">{bay.pcName ?? bay.name}</p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-extrabold ${
                      bay.agentOnline
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-gray-300 bg-gray-100 text-gray-500"
                    }`}
                  >
                    <span className={`size-2 rounded-full ${bay.agentOnline ? "bg-emerald-500" : "bg-gray-400"}`} />
                    PC {bay.agentOnline ? "켜짐" : "확인 안 됨"}
                  </span>
                </div>
                <p className="mt-3 min-h-5 text-xs font-semibold text-[#697468]">
                  {bay.lastSeenAt
                    ? `Agent 마지막 신호 ${new Date(bay.lastSeenAt).toLocaleString("ko-KR")}`
                    : "Agent 신호 기록 없음 · PC 전원 확인 필요"}
                </p>
                {bay.inUse && !bay.agentOnline ? (
                  <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs font-extrabold text-amber-800">
                    이용 중인데 PC Agent 신호가 없습니다
                  </p>
                ) : null}
                <BayControls
                  bay={bay}
                  pcDisabled={
                    busy !== null || (!bay.agentOnline && (!controllerReady || !bay.hasAutomation))
                  }
                  equipmentDisabled={busy !== null || !controllerReady || !bay.hasAutomation}
                  pcPending={busy === `pc:${bay.id}`}
                  equipmentPending={busy === `equipment:${bay.id}`}
                  onPcToggle={(turnOn) =>
                    void run(
                      turnOn ? "bay_on" : "pc_shutdown",
                      turnOn
                        ? `${bay.code} 프로젝터를 켜고 잠시 후 타석 PC를 부팅합니다. 진행할까요?`
                        : `${bay.code} PC를 Windows 정상 종료합니다. 약 10초 후 종료되며 프로젝터는 별도 장비 OFF 버튼으로 끌 수 있습니다. 진행할까요?`,
                      bay.id,
                      `pc:${bay.id}`
                    )
                  }
                  onEquipmentCommand={(turnOn) =>
                    void run(
                      turnOn ? "bay_on" : "bay_off",
                      turnOn
                        ? `${bay.code} 프로젝터와 타석 장비를 켜고 PC 부팅 신호도 보냅니다. 진행할까요?`
                        : `${bay.code} 프로젝터와 연결 장비에 OFF 명령을 보냅니다. PC 전원은 위 스위치에서 별도로 정상 종료합니다. 진행할까요?`,
                      bay.id,
                      `equipment:${bay.id}`
                    )
                  }
                />
              </article>
            ))}
          </div>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <article className="rounded-md border border-[#dfe8dc] bg-white shadow-soft-line">
            <div className="flex items-center justify-between gap-4 border-b border-[#e5ece1] p-5">
              <div>
                <p className="text-sm font-bold text-vista-leaf">실시간 이용 현황</p>
                <h2 className="mt-1 text-xl font-extrabold">현재 이용 세션</h2>
              </div>
              <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-md border border-[#cad8c6] px-3 py-2 text-sm font-bold disabled:opacity-60" disabled={loading}>
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> 새로고침
              </button>
            </div>
            <div className="divide-y divide-[#edf2ea]">
              {loading ? (
                <div className="flex items-center gap-2 p-5 text-sm font-bold text-[#697468]"><Loader2 className="animate-spin" size={18} /> 불러오는 중</div>
              ) : status?.sessions.length ? (
                status.sessions.map((session) => (
                  <div key={session.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-lg font-extrabold">{session.bay} <span className="ml-2 text-sm font-bold text-[#697468]">{session.customer}</span></p>
                      <p className="mt-1 text-sm text-[#697468]">{session.startedAt} 시작 · {session.endsAt} 종료 예정</p>
                    </div>
                    <span className={`w-fit rounded-md px-3 py-2 text-sm font-extrabold ${session.expired ? "bg-rose-100 text-rose-800" : "bg-sky-100 text-sky-800"}`}>{remainingLabel(session)}</span>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-sm font-bold text-[#697468]">진행 중인 이용이 없습니다.</div>
              )}
            </div>
            <div className="border-t border-[#edf2ea] p-4">
              <Link href="/admin/dashboard" className="text-sm font-extrabold text-vista-leaf hover:underline">타석별 입장·이용 종료는 운영 대시보드에서 처리합니다.</Link>
            </div>
          </article>

          <article className="rounded-md border border-[#dfe8dc] bg-white p-5 shadow-soft-line">
            <p className="text-sm font-bold text-vista-leaf">제어 기록</p>
            <h2 className="mt-1 text-xl font-extrabold">최근 자동화 로그</h2>
            <div className="mt-4 grid gap-3">
              {status?.logs.length ? status.logs.map((log) => (
                <div key={log.id} className="rounded-md bg-[#fbfcfa] p-3 ring-1 ring-[#e5ece1]">
                  <div className="flex items-center justify-between gap-3"><p className="text-sm font-extrabold">{log.title}</p><span className="text-xs font-bold text-vista-leaf">{log.time}</span></div>
                  <p className="mt-2 text-xs font-semibold text-[#697468]">{log.detail}</p>
                </div>
              )) : <p className="py-6 text-sm font-bold text-[#697468]">최근 제어 기록이 없습니다.</p>}
            </div>
          </article>
        </section>

        <section className="mt-6 flex items-start gap-3 rounded-md border border-[#dfe8dc] bg-white p-5 text-sm leading-6 text-[#697468] shadow-soft-line">
          <ShieldCheck className="mt-0.5 shrink-0 text-vista-leaf" size={22} />
          <p>타석 PC와 프로젝터의 개별 시작은 고객 입장 또는 운영 대시보드의 관리자 입장 시작에서 처리합니다. 이 화면은 매장 공용 장비와 종료 초과 세션 정리에 집중합니다.</p>
        </section>
      </div>
    </div>
  );
}
