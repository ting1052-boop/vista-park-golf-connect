"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";

type DurationOption = { minutes: number; price: number; bonusMinutes: number };
type ApiResponse = { ok?: boolean; message?: string; options?: DurationOption[]; defaults?: DurationOption[] };

type DraftRow = { minutes: string; price: string; bonusMinutes: string };

function toDraft(options: DurationOption[]): DraftRow[] {
  return options.map((option) => ({
    minutes: String(option.minutes),
    price: String(option.price),
    bonusMinutes: String(option.bonusMinutes)
  }));
}

export function PricingClient() {
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [defaults, setDefaults] = useState<DurationOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/store-policy", { cache: "no-store" });
      const data = (await response.json()) as ApiResponse;
      if (!response.ok || data.ok === false) throw new Error(data.message ?? "요금표를 불러오지 못했습니다.");
      setRows(toDraft(data.options ?? []));
      setDefaults(data.defaults ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "요금표를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateRow = (index: number, key: keyof DraftRow, value: string) => {
    setRows((prev) => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)));
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const options = rows.map((row) => ({
        minutes: Number(row.minutes),
        price: Number(row.price),
        bonusMinutes: Number(row.bonusMinutes || "0")
      }));

      const response = await fetch("/api/admin/store-policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ options })
      });
      const data = (await response.json()) as ApiResponse;
      if (!response.ok || data.ok === false) throw new Error(data.message ?? "저장에 실패했습니다.");

      setRows(toDraft(data.options ?? options));
      setMessage(data.message ?? "요금표를 저장했습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-4xl">
        <section className="rounded-md border border-[#dfe8dc] bg-white p-6 shadow-soft-line">
          <p className="text-sm font-bold text-vista-leaf">요금 설정</p>
          <h1 className="mt-1 text-3xl font-extrabold">이용시간과 요금을 관리합니다</h1>
          <p className="mt-3 text-sm leading-6 text-[#697468]">
            여기서 저장한 값이 고객 예약 화면과 입구 키오스크에 그대로 표시되고, 실제 과금 기준이 됩니다.
            서비스 시간은 요금은 그대로 두고 타석을 더 오래 쓰게 해주는 시간입니다.
          </p>
        </section>

        {(message || error) && (
          <div
            className={`mt-5 flex items-start gap-3 rounded-md border p-4 text-sm font-bold ${
              error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            {error ? <AlertTriangle size={20} className="shrink-0" /> : <CheckCircle2 size={20} className="shrink-0" />}
            <p>{error ?? message}</p>
          </div>
        )}

        <section className="mt-5 rounded-md border border-[#dfe8dc] bg-white shadow-soft-line">
          <div className="border-b border-[#e5ece1] p-5">
            <h2 className="text-lg font-extrabold">이용시간표</h2>
            <p className="mt-1 text-sm text-[#697468]">실제 타석 점유 시간 = 이용시간 + 서비스 시간</p>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 p-6 text-sm font-bold text-[#697468]">
              <Loader2 className="animate-spin" size={18} /> 불러오는 중
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-vista-fairway text-[#566153]">
                    <tr>
                      <th className="px-5 py-3 font-bold">이용시간(분)</th>
                      <th className="px-5 py-3 font-bold">요금(원)</th>
                      <th className="px-5 py-3 font-bold">서비스 시간(분)</th>
                      <th className="px-5 py-3 font-bold">실제 점유</th>
                      <th className="px-5 py-3 font-bold">삭제</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf2ea]">
                    {rows.map((row, index) => {
                      const blockMinutes = (Number(row.minutes) || 0) + (Number(row.bonusMinutes) || 0);
                      return (
                        <tr key={index}>
                          <td className="px-5 py-3">
                            <input
                              type="number"
                              inputMode="numeric"
                              value={row.minutes}
                              onChange={(event) => updateRow(index, "minutes", event.target.value)}
                              className="h-11 w-28 rounded-md border border-[#cad8c6] px-3 font-bold"
                            />
                          </td>
                          <td className="px-5 py-3">
                            <input
                              type="number"
                              inputMode="numeric"
                              value={row.price}
                              onChange={(event) => updateRow(index, "price", event.target.value)}
                              className="h-11 w-32 rounded-md border border-[#cad8c6] px-3 font-bold"
                            />
                          </td>
                          <td className="px-5 py-3">
                            <input
                              type="number"
                              inputMode="numeric"
                              value={row.bonusMinutes}
                              onChange={(event) => updateRow(index, "bonusMinutes", event.target.value)}
                              className="h-11 w-28 rounded-md border border-[#cad8c6] px-3 font-bold"
                            />
                          </td>
                          <td className="px-5 py-3 font-extrabold text-vista-leaf">{blockMinutes}분</td>
                          <td className="px-5 py-3">
                            <button
                              type="button"
                              onClick={() => setRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index))}
                              className="inline-flex size-10 items-center justify-center rounded-md border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                              aria-label={`${row.minutes}분 삭제`}
                            >
                              <Trash2 size={17} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-3 border-t border-[#edf2ea] p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setRows((prev) => [...prev, { minutes: "", price: "", bonusMinutes: "0" }])}
                    className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[#cad8c6] bg-white px-4 text-sm font-extrabold"
                  >
                    <Plus size={17} /> 이용시간 추가
                  </button>
                  <button
                    type="button"
                    onClick={() => setRows(toDraft(defaults))}
                    className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[#cad8c6] bg-white px-4 text-sm font-extrabold text-[#697468]"
                  >
                    <RotateCcw size={17} /> 기본값으로 되돌리기
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving || rows.length === 0}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-vista-leaf px-6 text-base font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />} 저장
                </button>
              </div>
            </>
          )}
        </section>

        <section className="mt-5 rounded-md border border-[#dfe8dc] bg-white p-5 text-sm leading-6 text-[#697468] shadow-soft-line">
          <p className="font-extrabold text-vista-ink">참고</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>저장 즉시 고객 예약 화면과 키오스크에 반영됩니다. 이미 진행 중인 이용에는 영향이 없습니다.</li>
            <li>관리자 수동 입장은 이 표에 없는 시간(예: 3시간)도 지정할 수 있고, 그때는 시간당 요금으로 계산됩니다.</li>
            <li>90분 이상은 매장 승인 후 확정되는 정책이 함께 적용됩니다.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
