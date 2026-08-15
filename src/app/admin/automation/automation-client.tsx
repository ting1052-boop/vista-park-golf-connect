"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Power, RefreshCw, ShieldCheck, Timer, Zap } from "lucide-react";

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
};

type AutomationStatus = {
  controllerEnabled: boolean;
  sessions: SessionRow[];
  logs: LogRow[];
  bays: BayControlRow[];
};

type ApiResponse = { ok?: boolean; message?: string };

function remainingLabel(session: SessionRow) {
  if (session.remainingMinutes === null) return "시간 확인 필요";
  if (session.remainingMinutes <= 0) return `${Math.abs(session.remainingMinutes)}분 초과`;
  return `${session.remainingMinutes}분 남음`;
}

export function AutomationClient() {
  const [status, setStatus] = useState<AutomationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/automation", { cache: "no-store" });
      const data = (await response.json()) as AutomationStatus & ApiResponse;
      if (!response.ok || data.ok === false) throw new Error(data.message ?? "무인제어 현황을 불러오지 못했습니다.");
      setStatus(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "무인제어 현황을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(
    action: "close_expired" | "shared_on" | "shared_off" | "store_close" | "bay_off",
    confirmation: string,
    bayId?: string
  ) {
    if (!window.confirm(confirmation)) return;

    setBusy(action);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, bayId })
      });
      const data = (await response.json()) as ApiResponse;
      if (!response.ok || data.ok === false) throw new Error(data.message ?? "처리에 실패했습니다.");
      setMessage(data.message ?? "처리가 완료되었습니다.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "처리 중 오류가 발생했습니다.");
    } finally {
      setBusy(null);
    }
  }

  const expiredCount = status?.sessions.filter((session) => session.expired).length ?? 0;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <section className="rounded-md border border-[#dfe8dc] bg-white p-6 shadow-soft-line">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-bold text-vista-leaf">무인 매장 제어</p>
              <h1 className="mt-1 text-3xl font-extrabold">이용시간과 매장 장비를 관리합니다</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#697468]">
                종료 시간이 지난 이용을 정리하고, 매장 노트북 제어기를 통해 공용 장비 준비와 종료 명령을 전달합니다.
              </p>
            </div>
            <div className={`rounded-md px-4 py-3 text-sm font-extrabold ${status?.controllerEnabled ? "bg-[#edf6ef] text-vista-leaf" : "bg-[#fff4eb] text-[#9a561a]"}`}>
              {status?.controllerEnabled ? "매장 제어기 연결 사용" : "매장 제어기 연결 확인 필요"}
            </div>
          </div>
        </section>

        {(message || error) && (
          <div className={`mt-5 flex items-start gap-3 rounded-md border p-4 text-sm font-bold ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
            {error ? <AlertTriangle size={20} className="shrink-0" /> : <CheckCircle2 size={20} className="shrink-0" />}
            <p>{error ?? message}</p>
          </div>
        )}

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
            disabled={busy !== null || !status?.controllerEnabled}
            onClick={() => void run("shared_on", "공용 조명과 냉난방 준비 명령을 보냅니다. 실행할까요?")}
            className="rounded-md border border-[#dfe8dc] bg-white p-5 text-left shadow-soft-line transition hover:border-vista-leaf hover:bg-vista-fairway disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="grid size-12 place-items-center rounded-md bg-vista-leaf text-white"><Zap size={22} /></span>
            <h2 className="mt-4 text-lg font-extrabold">매장 준비 ON</h2>
            <p className="mt-2 text-sm leading-6 text-[#697468]">매장 노트북 제어기에 공용 장비 준비를 요청합니다.</p>
          </button>

          <button
            type="button"
            disabled={busy !== null || !status?.controllerEnabled}
            onClick={() =>
              void run(
                "store_close",
                "매장을 종료합니다. 모든 타석 장비를 끈 뒤 공용 조명과 냉난방을 끕니다. 이용 중인 고객이 없을 때만 실행됩니다. 진행할까요?"
              )
            }
            className="rounded-md border border-[#efc7c7] bg-[#fff8f8] p-5 text-left shadow-soft-line transition hover:border-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="grid size-12 place-items-center rounded-md bg-rose-600 text-white"><Power size={22} /></span>
            <h2 className="mt-4 text-lg font-extrabold">매장 종료</h2>
            <p className="mt-2 text-sm leading-6 text-[#697468]">모든 타석 장비를 끈 뒤 공용 조명과 냉난방을 순서대로 종료합니다.</p>
          </button>
        </section>

        <section className="mt-6 rounded-md border border-[#dfe8dc] bg-white shadow-soft-line">
          <div className="border-b border-[#e5ece1] p-5">
            <p className="text-sm font-bold text-vista-leaf">타석 PC 연결 상태</p>
            <h2 className="mt-1 text-xl font-extrabold">Agent 연결과 타석별 장비 제어</h2>
            <p className="mt-2 text-sm leading-6 text-[#697468]">
              PC가 켜져 있어도 고객 이용 세션이 없으면 이용 중으로 계산하지 않습니다. 아래 연결 상태는 Agent의 최근 신호입니다.
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
                    Agent {bay.agentOnline ? "연결" : "연결 끊김"}
                  </span>
                </div>
                <p className="mt-3 min-h-5 text-xs font-semibold text-[#697468]">
                  {bay.lastSeenAt
                    ? `마지막 신호 ${new Date(bay.lastSeenAt).toLocaleString("ko-KR")}`
                    : "Agent 신호 기록 없음"}
                </p>
                <button
                  type="button"
                  disabled={busy !== null || !status.controllerEnabled || !bay.hasAutomation}
                  onClick={() =>
                    void run(
                      "bay_off",
                      `${bay.code} 프로젝터와 연결 장비에 OFF 명령을 보냅니다. PC는 강제 종료하지 않습니다. 진행할까요?`,
                      bay.id
                    )
                  }
                  className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-extrabold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Power size={17} /> 타석 장비 OFF
                </button>
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
