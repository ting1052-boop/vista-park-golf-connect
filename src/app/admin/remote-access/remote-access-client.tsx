"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Copy, History, Loader2, MonitorSmartphone, Plus, RefreshCw } from "lucide-react";

type Device = {
  deviceId: string;
  storeName: string;
  storeCode: string | null;
  bayCode: string;
  bayName: string | null;
  pcType: string;
  computerName: string;
  anydeskId: string;
  windowsEdition: string | null;
  windowsVersion: string | null;
  activationStatus: string;
  setupToolVersion: string | null;
  registeredAt: string;
  updatedAt: string;
};

type HistoryEntry = {
  id: string;
  deviceId: string;
  previousAnydeskId: string | null;
  newAnydeskId: string;
  changedAt: string;
  changeSource: string;
};

type StoreOption = {
  id: string;
  code: string;
  name: string;
  bays: Array<{ id: string; bayCode: string; name: string }>;
};

type ApiResponse = {
  ok?: boolean;
  message?: string;
  devices?: Device[];
  history?: HistoryEntry[];
  stores?: StoreOption[];
};

type SaveResponse = {
  ok?: boolean;
  code?: string;
  message?: string;
  action?: string;
  conflict?: { computerName: string; anydeskId: string; bayCode: string | null } | null;
};

const emptyDraft = {
  storeId: "",
  bayId: "",
  pcType: "park",
  computerName: "",
  anydeskId: "",
  windowsEdition: "",
  activationStatus: "unknown"
};

const pcTypeLabel: Record<string, string> = { range: "골프연습장", park: "파크골프" };
const activationLabel: Record<string, string> = {
  licensed: "정품인증됨",
  unlicensed: "미인증",
  unknown: "확인 안 됨"
};
const sourceLabel: Record<string, string> = {
  setup_tool: "세팅 도구",
  admin: "관리자",
  replace: "장비 교체"
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function RemoteAccessClient() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [openHistoryFor, setOpenHistoryFor] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (deviceId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = deviceId ? `/api/admin/remote-access?deviceId=${encodeURIComponent(deviceId)}` : "/api/admin/remote-access";
      const response = await fetch(url, { cache: "no-store" });
      const data = (await response.json()) as ApiResponse;
      if (!response.ok || data.ok === false) throw new Error(data.message ?? "원격접속 목록을 불러오지 못했습니다.");
      setDevices(data.devices ?? []);
      setHistory(data.history ?? []);
      setStores(data.stores ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "원격접속 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  const bayOptions = stores.find((store) => store.id === draft.storeId)?.bays ?? [];

  const save = async (replace: boolean) => {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/remote-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: draft.storeId,
          bayId: draft.bayId,
          pcType: draft.pcType,
          computerName: draft.computerName.trim(),
          anydeskId: draft.anydeskId.trim(),
          windowsEdition: draft.windowsEdition.trim() || undefined,
          activationStatus: draft.activationStatus,
          replace
        })
      });
      const data = (await response.json()) as SaveResponse;

      if (!response.ok || data.ok === false) {
        // 이 타석에 이미 다른 PC 가 있으면 사람이 교체를 확인한 뒤에만 바꾼다.
        if (data.code === "slot_occupied" && data.conflict && !replace) {
          const ok = window.confirm(
            `${data.conflict.bayCode ?? "이 타석"}에는 이미 ${data.conflict.computerName}` +
              ` (AnyDesk ${data.conflict.anydeskId}) 이(가) 등록되어 있습니다.\n\n` +
              "이 PC 로 교체하시겠습니까? 기존 등록은 삭제되고 교체 이력이 남습니다."
          );
          if (ok) {
            setSaving(false);
            await save(true);
            return;
          }
          setError("교체하지 않았습니다.");
          return;
        }

        throw new Error(data.message ?? "등록에 실패했습니다.");
      }

      setMessage(data.action === "unchanged" ? "이미 같은 내용으로 등록되어 있습니다." : "등록했습니다.");
      setDraft((current) => ({ ...emptyDraft, storeId: current.storeId, pcType: current.pcType }));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "등록에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    void load();
  }, [load]);

  const toggleHistory = (deviceId: string) => {
    if (openHistoryFor === deviceId) {
      setOpenHistoryFor(null);
      return;
    }
    setOpenHistoryFor(deviceId);
    void load(deviceId);
  };

  const copyId = async (anydeskId: string) => {
    try {
      await navigator.clipboard.writeText(anydeskId);
      setCopiedId(anydeskId);
      window.setTimeout(() => setCopiedId((current) => (current === anydeskId ? null : current)), 2000);
    } catch {
      setError("클립보드에 복사하지 못했습니다. ID 를 직접 선택해 복사해주세요.");
    }
  };

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">원격접속</h1>
          <p className="mt-1 text-sm font-semibold text-[#697468]">
            HH 골프 PC 세팅 도구가 등록한 타석 PC 의 AnyDesk 주소입니다. 무인접속 비밀번호는 저장하지 않습니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load(openHistoryFor ?? undefined)}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md border border-[#cad8c6] bg-white px-4 py-2 text-sm font-bold disabled:opacity-60"
        >
          {loading ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
          새로고침
        </button>
      </header>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save(false);
        }}
        className="rounded-md border border-[#dfe8dc] bg-[#fbfcfa] p-4"
      >
        <div className="flex items-center gap-2">
          <Plus className="text-vista-leaf" size={18} aria-hidden="true" />
          <h2 className="font-extrabold">수동 등록</h2>
        </div>
        <p className="mt-1 text-xs font-semibold text-[#697468]">
          세팅 도구를 돌릴 수 없는 PC 를 직접 넣습니다. 매장과 타석은 먼저 등록되어 있어야 합니다.
        </p>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="grid gap-1 text-xs font-bold text-[#4f5b50]">
            매장
            <select
              value={draft.storeId}
              onChange={(event) => setDraft((current) => ({ ...current, storeId: event.target.value, bayId: "" }))}
              required
              className="rounded-md border border-[#cad8c6] bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-vista-leaf"
            >
              <option value="">선택하세요</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-xs font-bold text-[#4f5b50]">
            타석
            <select
              value={draft.bayId}
              onChange={(event) => setDraft((current) => ({ ...current, bayId: event.target.value }))}
              required
              disabled={bayOptions.length === 0}
              className="rounded-md border border-[#cad8c6] bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-vista-leaf disabled:opacity-60"
            >
              <option value="">{draft.storeId ? "선택하세요" : "매장을 먼저 고르세요"}</option>
              {bayOptions.map((bay) => (
                <option key={bay.id} value={bay.id}>
                  {bay.bayCode} · {bay.name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-xs font-bold text-[#4f5b50]">
            구분
            <select
              value={draft.pcType}
              onChange={(event) => setDraft((current) => ({ ...current, pcType: event.target.value }))}
              className="rounded-md border border-[#cad8c6] bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-vista-leaf"
            >
              <option value="park">파크골프</option>
              <option value="range">골프연습장</option>
            </select>
          </label>

          <label className="grid gap-1 text-xs font-bold text-[#4f5b50]">
            PC 이름
            <input
              value={draft.computerName}
              onChange={(event) => setDraft((current) => ({ ...current, computerName: event.target.value }))}
              required
              placeholder="예: PARK01"
              className="rounded-md border border-[#cad8c6] bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-vista-leaf"
            />
          </label>

          <label className="grid gap-1 text-xs font-bold text-[#4f5b50]">
            AnyDesk ID
            <input
              value={draft.anydeskId}
              onChange={(event) => setDraft((current) => ({ ...current, anydeskId: event.target.value }))}
              required
              inputMode="numeric"
              placeholder="예: 123 456 789"
              className="rounded-md border border-[#cad8c6] bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-vista-leaf"
            />
          </label>

          <label className="grid gap-1 text-xs font-bold text-[#4f5b50]">
            Windows <span className="font-semibold text-[#8a968b]">(선택)</span>
            <input
              value={draft.windowsEdition}
              onChange={(event) => setDraft((current) => ({ ...current, windowsEdition: event.target.value }))}
              placeholder="예: Windows 11 IoT Enterprise"
              className="rounded-md border border-[#cad8c6] bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-vista-leaf"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={saving || loading}
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md bg-vista-leaf px-4 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
          등록
        </button>
      </form>

      {message ? (
        <p className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">
          <Check size={16} aria-hidden="true" />
          {message}
        </p>
      ) : null}

      {error ? (
        <p className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">
          <AlertTriangle size={16} aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <div className="rounded-md border border-[#dfe8dc] bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-[1040px] text-left text-sm">
            <thead className="bg-vista-fairway text-[#566153]">
              <tr>
                {["매장", "타석", "구분", "PC 이름", "AnyDesk ID", "Windows", "마지막 등록", "연결"].map((label) => (
                  <th key={label} className="px-4 py-3 font-extrabold">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf2ea]">
              {devices.map((device) => (
                <tr key={device.deviceId} className="align-top hover:bg-[#fbfcfa]">
                  <td className="px-4 py-4 font-semibold">{device.storeName}</td>
                  <td className="px-4 py-4 font-extrabold">{device.bayCode}</td>
                  <td className="px-4 py-4 font-semibold">{pcTypeLabel[device.pcType] ?? device.pcType}</td>
                  <td className="px-4 py-4 font-semibold">{device.computerName}</td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold tabular-nums">{device.anydeskId}</span>
                      <button
                        type="button"
                        onClick={() => void copyId(device.anydeskId)}
                        aria-label={`${device.computerName} AnyDesk ID 복사`}
                        className="rounded-md border border-[#cad8c6] bg-white p-1.5"
                      >
                        {copiedId === device.anydeskId ? (
                          <Check size={14} className="text-vista-leaf" aria-hidden="true" />
                        ) : (
                          <Copy size={14} aria-hidden="true" />
                        )}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleHistory(device.deviceId)}
                      className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-[#697468] underline"
                    >
                      <History size={13} aria-hidden="true" />
                      변경 이력
                    </button>
                    {openHistoryFor === device.deviceId ? (
                      <ul className="mt-2 space-y-1 rounded-md bg-[#f4f7f2] p-2 text-xs font-semibold text-[#4f5b50]">
                        {history.length > 0 ? (
                          history.map((entry) => (
                            <li key={entry.id}>
                              {formatDateTime(entry.changedAt)} · {entry.previousAnydeskId ?? "최초 등록"} →{" "}
                              {entry.newAnydeskId} ({sourceLabel[entry.changeSource] ?? entry.changeSource})
                            </li>
                          ))
                        ) : (
                          <li>기록이 없습니다.</li>
                        )}
                      </ul>
                    ) : null}
                  </td>
                  <td className="px-4 py-4 font-semibold">
                    <p>{device.windowsEdition ?? "-"}</p>
                    <p className="mt-0.5 text-xs text-[#697468]">
                      {device.windowsVersion ?? "-"} · {activationLabel[device.activationStatus] ?? device.activationStatus}
                    </p>
                  </td>
                  <td className="px-4 py-4 font-semibold">
                    <p>{formatDateTime(device.registeredAt)}</p>
                    {device.setupToolVersion ? (
                      <p className="mt-0.5 text-xs text-[#697468]">
                        {device.setupToolVersion === "manual" ? "수동 등록" : `세팅 도구 ${device.setupToolVersion}`}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-4">
                    {/* AnyDesk 가 등록하는 프로토콜. 관리자 PC 에 설치돼 있으면 바로 열린다. */}
                    <a
                      href={`anydesk:${device.anydeskId}`}
                      className="inline-flex items-center gap-2 rounded-md bg-vista-leaf px-3 py-2 text-xs font-extrabold text-white"
                    >
                      <MonitorSmartphone size={14} aria-hidden="true" />
                      연결
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && devices.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm font-bold text-[#697468]">
            등록된 PC 가 없습니다. 세팅 도구에서 등록하면 여기에 표시됩니다.
          </p>
        ) : null}
      </div>
    </section>
  );
}
