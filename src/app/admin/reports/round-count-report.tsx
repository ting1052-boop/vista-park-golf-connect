"use client";

import { useCallback, useEffect, useState } from "react";

type Num = number | string;
type Row = {
  day: string;
  bay_id: string;
  started: Num;
  counted_games: Num;
  partial: Num;
  unverified: Num;
  practice_count: Num;
  practice_minutes: Num;
  open_stale: Num;
};
type Response = {
  ok: boolean;
  message?: string;
  enabled?: boolean;
  from?: string;
  to?: string;
  bays?: Array<{ id: string; display_name: string | null; bay_code: string }>;
  rows?: Row[];
};
type Cells = { counted: number; partial: number; practice: number; practiceMinutes: number; pending: number; started: number };

// 서버 값을 그대로 더해 보여주기만 한다. 확인 대기 = 판정 못한 판(unverified) + 12시간 넘게 안 끝난 판(open_stale).
function cellsOf(rows: Row[]): Cells {
  const sum = (key: keyof Row) => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
  return {
    counted: sum("counted_games"),
    partial: sum("partial"),
    practice: sum("practice_count"),
    practiceMinutes: sum("practice_minutes"),
    pending: sum("unverified") + sum("open_stale"),
    started: sum("started")
  };
}

function CellsView({ cells }: { cells: Cells }) {
  return (
    <>
      <td className="p-2 text-right text-base font-extrabold">{cells.counted}</td>
      <td className="p-2 text-right">{cells.partial}</td>
      <td className="p-2 text-right">{cells.practice}회 · {cells.practiceMinutes}분</td>
      <td className={`p-2 text-right ${cells.pending > 0 ? "font-extrabold text-amber-700" : ""}`}>{cells.pending}</td>
      <td className="p-2 text-right">{cells.started}</td>
    </>
  );
}

export function RoundCountReport() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (range?: { from: string; to: string }) => {
    setLoading(true);
    try {
      const query = range ? `?${new URLSearchParams(range)}` : "";
      const response = await fetch(`/api/admin/round-counts${query}`, { cache: "no-store" });
      const body = (await response.json()) as Response;
      setData(response.ok ? body : { ok: false, message: body.message ?? "게임 수를 불러오지 못했습니다." });
      if (response.ok && body.from && body.to) {
        setFrom(body.from);
        setTo(body.to);
      }
    } catch {
      setData({ ok: false, message: "게임 수를 불러오지 못했습니다." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const bays = data?.bays ?? [];
  const rows = data?.rows ?? [];
  const days = [...new Set(rows.map((row) => row.day))].sort().reverse();

  return (
    <section className="rounded-md border border-[#dfe8dc] bg-white p-5 shadow-soft-line">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-extrabold">파크골프 게임 수 (날짜별 · 타석별)</h2>
          <p className="mt-1 text-sm text-[#697468]">Agent가 보고한 기록을 서버가 판정한 값입니다. 통계·대조용이며 요금 근거가 아닙니다.</p>
        </div>
        <form
          className="flex flex-wrap items-end gap-2 text-sm"
          onSubmit={(event) => {
            event.preventDefault();
            void load({ from, to });
          }}
        >
          <label className="grid gap-1 font-bold">
            시작일
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="rounded-md border border-[#d9e4d6] px-2 py-1.5" required />
          </label>
          <label className="grid gap-1 font-bold">
            종료일
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="rounded-md border border-[#d9e4d6] px-2 py-1.5" required />
          </label>
          <button type="submit" disabled={loading} className="rounded-md bg-vista-leaf px-4 py-2 font-extrabold text-white disabled:opacity-60">
            조회
          </button>
        </form>
      </div>

      <div className="mt-4 overflow-x-auto">
        {loading && !data ? (
          <p className="text-sm text-[#697468]">불러오는 중...</p>
        ) : data?.ok === false ? (
          <p className="text-sm font-bold text-rose-700">{data.message}</p>
        ) : data?.enabled === false ? (
          <p className="text-sm font-bold text-[#697468]">이 매장은 게임 수 집계를 사용하지 않습니다.</p>
        ) : days.length === 0 ? (
          <p className="text-sm font-bold text-[#697468]">이 기간에 기록된 게임이 없습니다.</p>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#dfe8dc] text-xs text-[#5f6b5e]">
                <th className="p-2">날짜</th>
                <th className="p-2">타석</th>
                <th className="p-2 text-right">확정 게임</th>
                <th className="p-2 text-right">중도 종료</th>
                <th className="p-2 text-right">연습</th>
                <th className="p-2 text-right">확인 대기</th>
                <th className="p-2 text-right">시작</th>
              </tr>
            </thead>
            <tbody>
              {days.flatMap((day) => {
                const dayRows = rows.filter((row) => row.day === day);
                return [
                  ...bays.map((bay, index) => (
                    <tr key={`${day}-${bay.id}`} className="border-b border-[#edf2ea]">
                      <td className="p-2 font-bold">{index === 0 ? day : ""}</td>
                      <td className="p-2">{bay.display_name || bay.bay_code}</td>
                      <CellsView cells={cellsOf(dayRows.filter((row) => row.bay_id === bay.id))} />
                    </tr>
                  )),
                  <tr key={`${day}-total`} className="border-b-2 border-[#dfe8dc] bg-vista-fairway font-bold">
                    <td className="p-2" />
                    <td className="p-2">합계</td>
                    <CellsView cells={cellsOf(dayRows)} />
                  </tr>
                ];
              })}
            </tbody>
          </table>
        )}
      </div>

      <ul className="mt-4 list-disc space-y-1 pl-5 text-xs leading-5 text-[#697468]">
        <li>확정 게임·중도 종료·연습·확인 대기는 판이 끝난 날짜, 시작은 코스에 들어간 날짜 기준입니다. 자정을 넘긴 판은 두 날짜에 나뉘어 보일 수 있습니다.</li>
        <li>확인 대기: 끝났지만 아직 게임 수를 판정하지 못한 판과, 시작 후 12시간이 넘도록 끝나지 않은 판입니다.</li>
        <li>기록이 없는 날은 표시하지 않습니다. 한 번에 최대 93일까지 조회할 수 있습니다.</li>
      </ul>
    </section>
  );
}
