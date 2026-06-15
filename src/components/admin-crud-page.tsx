"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Database, Pencil, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const DEFAULT_STORE_ID = "11111111-1111-4111-8111-111111111111";

export type CrudResource = "stores" | "bays" | "reservations" | "devices" | "members";

export type CrudField = {
  key: string;
  label: string;
  placeholder?: string;
  type?: "text" | "datetime-local" | "select" | "number";
  options?: string[];
};

export type CrudRow = {
  id: string;
  [key: string]: string;
};

type AdminCrudPageProps = {
  title: string;
  description: string;
  tableName: string;
  resource: CrudResource;
  fields: CrudField[];
  initialRows: CrudRow[];
};

type StoreRecord = {
  id: string;
  code: string | null;
  name: string | null;
  address: string | null;
  phone: string | null;
  bay_count: number | null;
  status: string | null;
};

type BayRecord = {
  id: string;
  store_id: string | null;
  bay_code: string | null;
  display_name: string | null;
  status: string | null;
  memo: string | null;
};

type StoreOption = {
  id: string;
  code: string | null;
  name: string | null;
  bay_count: number | null;
};

type BaySyncRecord = {
  id: string;
  bay_code: string | null;
  status: string | null;
};

type ReservationRecord = {
  id: string;
  starts_at: string | null;
  guest_name: string | null;
  party_size: number | null;
  channel: string | null;
  status: string | null;
  approval_required: boolean | null;
  memo: string | null;
  bays?: { bay_code?: string | null } | Array<{ bay_code?: string | null }> | null;
};

type DeviceRecord = {
  id: string;
  device_code: string | null;
  name: string | null;
  device_type: string | null;
  status: string | null;
  last_serviced_on: string | null;
};

type MemberRecord = {
  id: string;
  nickname: string | null;
  phone_last4: string | null;
  login_provider: string | null;
  age_group: string | null;
  memo: string | null;
};

function createEmptyRow(fields: CrudField[]) {
  return fields.reduce<CrudRow>(
    (acc, field) => {
      acc[field.key] = "";
      return acc;
    },
    { id: "" }
  );
}

function formatDateTimeLocal(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIsoFromLocal(value: string) {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function addMinutes(value: string, minutes: number) {
  const date = new Date(toIsoFromLocal(value));
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

function mapStore(record: StoreRecord): CrudRow {
  return {
    id: record.id,
    code: record.code ?? "",
    name: record.name ?? "",
    address: record.address ?? "",
    phone: record.phone ?? "",
    bay_count: String(record.bay_count ?? 0),
    status: record.status ?? "active"
  };
}

function mapBay(record: BayRecord): CrudRow {
  return {
    id: record.id,
    store_id: record.store_id ?? "",
    bay_code: record.bay_code ?? "",
    display_name: record.display_name ?? "",
    status: record.status ?? "available",
    memo: record.memo ?? ""
  };
}

function getReservationBayCode(record: ReservationRecord) {
  if (Array.isArray(record.bays)) {
    return record.bays[0]?.bay_code ?? "";
  }

  return record.bays?.bay_code ?? "";
}

function mapReservation(record: ReservationRecord): CrudRow {
  return {
    id: record.id,
    starts_at: formatDateTimeLocal(record.starts_at),
    guest_name: record.guest_name ?? "",
    bay_code: getReservationBayCode(record),
    party_size: String(record.party_size ?? 1),
    channel: record.channel ?? "admin",
    status: record.status ?? "requested",
    approval_policy: record.approval_required ? "매장 승인" : "자동 확정",
    memo: record.memo ?? ""
  };
}

function mapDevice(record: DeviceRecord): CrudRow {
  return {
    id: record.id,
    device_code: record.device_code ?? "",
    name: record.name ?? "",
    device_type: record.device_type ?? "",
    status: record.status ?? "available",
    last_serviced_on: record.last_serviced_on ?? ""
  };
}

function mapMember(record: MemberRecord): CrudRow {
  return {
    id: record.id,
    nickname: record.nickname ?? "",
    phone_last4: record.phone_last4 ?? "",
    login_provider: record.login_provider ?? "",
    age_group: record.age_group ?? "",
    memo: record.memo ?? ""
  };
}

async function getBayIdByCode(bayCode: string) {
  if (!bayCode.trim()) return null;

  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.from("bays").select("id").eq("bay_code", bayCode.trim()).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.id ?? null;
}

function isApprovalRequired(value: string) {
  return ["승인", "수동", "확인", "매장"].some((keyword) => value.includes(keyword));
}

function normalizeBayCount(value: string) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return 0;
  return Math.min(Math.max(parsed, 0), 99);
}

function getAutoBayCode(index: number) {
  return `A-${String(index).padStart(2, "0")}`;
}

async function ensureStoreBays(storeId: string, storeName: string, bayCount: number) {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase
    .from("bays")
    .select("id, bay_code, status")
    .eq("store_id", storeId)
    .order("bay_code", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const existingBays = (data ?? []) as BaySyncRecord[];
  const existingCodes = new Set(existingBays.map((bay) => bay.bay_code));
  const rowsToInsert = Array.from({ length: bayCount }, (_, index) => {
    const bayNo = index + 1;
    const bayCode = getAutoBayCode(bayNo);
    return {
      store_id: storeId,
      bay_code: bayCode,
      display_name: `A구역 ${bayNo}번 타석`,
      status: "available",
      memo: `${storeName || "신규 매장"} 자동 생성`
    };
  }).filter((row) => !existingCodes.has(row.bay_code));

  if (rowsToInsert.length > 0) {
    const { error: insertError } = await supabase.from("bays").insert(rowsToInsert);

    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  if (existingBays.length > bayCount) {
    const removableBays = existingBays
      .filter((bay) => ["available", "maintenance"].includes(bay.status ?? ""))
      .sort((first, second) => (second.bay_code ?? "").localeCompare(first.bay_code ?? ""));
    const removeCount = existingBays.length - bayCount;
    const bayIdsToDelete = removableBays.slice(0, removeCount).map((bay) => bay.id);

    if (bayIdsToDelete.length < removeCount) {
      throw new Error("이용 중이거나 입장 대기 중인 타석이 있어 타석수를 줄일 수 없습니다.");
    }

    const { error: deleteError } = await supabase.from("bays").delete().in("id", bayIdsToDelete);

    if (deleteError) {
      throw new Error(deleteError.message);
    }
  }
}

async function syncStoreBayCount(storeId: string) {
  const supabase = createBrowserSupabaseClient();
  const { count, error } = await supabase.from("bays").select("id", { count: "exact", head: true }).eq("store_id", storeId);

  if (error) {
    throw new Error(error.message);
  }

  const { error: updateError } = await supabase
    .from("stores")
    .update({
      bay_count: count ?? 0,
      updated_at: new Date().toISOString()
    })
    .eq("id", storeId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return count ?? 0;
}

export function AdminCrudPage({
  title,
  description,
  tableName,
  resource,
  fields,
  initialRows
}: AdminCrudPageProps) {
  const emptyRow = useMemo(() => createEmptyRow(fields), [fields]);
  const [rows, setRows] = useState(initialRows);
  const [draft, setDraft] = useState(emptyRow);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<CrudRow>(emptyRow);
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState(DEFAULT_STORE_ID);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedStore = useMemo(
    () => storeOptions.find((store) => store.id === selectedStoreId),
    [selectedStoreId, storeOptions]
  );

  const loadStoreOptions = async () => {
    const supabase = createBrowserSupabaseClient();
    const { data, error: queryError } = await supabase
      .from("stores")
      .select("id, code, name, bay_count")
      .order("name", { ascending: true });

    if (queryError) throw new Error(queryError.message);

    const options = (data ?? []) as StoreOption[];
    setStoreOptions(options);

    if (options.length > 0 && !options.some((store) => store.id === selectedStoreId)) {
      setSelectedStoreId(options[0].id);
    }
  };

  const loadRows = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const supabase = createBrowserSupabaseClient();

      if (resource === "stores") {
        const { data, error: queryError } = await supabase
          .from("stores")
          .select("id, code, name, address, phone, bay_count, status")
          .order("name", { ascending: true });

        if (queryError) throw new Error(queryError.message);
        setRows((data ?? []).map((record) => mapStore(record as StoreRecord)));
      }

      if (resource === "bays") {
        const { data, error: queryError } = await supabase
          .from("bays")
          .select("id, store_id, bay_code, display_name, status, memo")
          .eq("store_id", selectedStoreId)
          .order("bay_code", { ascending: true });

        if (queryError) throw new Error(queryError.message);
        setRows((data ?? []).map((record) => mapBay(record as BayRecord)));
      }

      if (resource === "reservations") {
        const { data, error: queryError } = await supabase
          .from("reservations")
          .select("id, starts_at, guest_name, party_size, channel, status, approval_required, memo, bays(bay_code)")
          .order("starts_at", { ascending: true });

        if (queryError) throw new Error(queryError.message);
        setRows((data ?? []).map((record) => mapReservation(record as ReservationRecord)));
      }

      if (resource === "devices") {
        const { data, error: queryError } = await supabase
          .from("devices")
          .select("id, device_code, name, device_type, status, last_serviced_on")
          .order("device_code", { ascending: true });

        if (queryError) throw new Error(queryError.message);
        setRows((data ?? []).map((record) => mapDevice(record as DeviceRecord)));
      }

      if (resource === "members") {
        const { data, error: queryError } = await supabase
          .from("members")
          .select("id, nickname, phone_last4, login_provider, age_group, memo")
          .order("nickname", { ascending: true });

        if (queryError) throw new Error(queryError.message);
        setRows((data ?? []).map((record) => mapMember(record as MemberRecord)));
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "목록을 불러오지 못했습니다.");
      setRows(initialRows);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource, selectedStoreId]);

  useEffect(() => {
    if (resource !== "bays") return;

    loadStoreOptions().catch((caughtError) => {
      setError(caughtError instanceof Error ? caughtError.message : "매장 목록을 불러오지 못했습니다.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource]);

  const addRow = async () => {
    if (!fields.some((field) => draft[field.key].trim())) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setMessage(null);

    try {
      const supabase = createBrowserSupabaseClient();

      if (resource === "stores") {
        const bayCount = normalizeBayCount(draft.bay_count);
        const { data: insertedStore, error: insertError } = await supabase
          .from("stores")
          .insert({
            code: draft.code.trim(),
            name: draft.name.trim(),
            address: draft.address.trim() || null,
            phone: draft.phone.trim() || null,
            bay_count: bayCount,
            status: draft.status.trim() || "active"
          })
          .select("id, name")
          .single();

        if (insertError) throw new Error(insertError.message);

        if (insertedStore?.id) {
          await ensureStoreBays(insertedStore.id, insertedStore.name ?? draft.name.trim(), bayCount);
          await syncStoreBayCount(insertedStore.id);
        }
      }

      if (resource === "bays") {
        const { error: insertError } = await supabase.from("bays").insert({
          store_id: selectedStoreId,
          bay_code: draft.bay_code.trim(),
          display_name: draft.display_name.trim() || draft.bay_code.trim(),
          status: draft.status.trim() || "available",
          memo: draft.memo.trim() || null
        });
        if (insertError) throw new Error(insertError.message);
        await syncStoreBayCount(selectedStoreId);
      }

      if (resource === "reservations") {
        const bayId = await getBayIdByCode(draft.bay_code);
        const { error: insertError } = await supabase.from("reservations").insert({
          store_id: DEFAULT_STORE_ID,
          bay_id: bayId,
          guest_name: draft.guest_name.trim() || "현장 고객",
          starts_at: toIsoFromLocal(draft.starts_at),
          ends_at: addMinutes(draft.starts_at, 60),
          party_size: Number(draft.party_size || 1),
          channel: draft.channel.trim() || "admin",
          status: draft.status.trim() || "requested",
          approval_required: isApprovalRequired(draft.approval_policy),
          memo: draft.memo.trim() || null
        });
        if (insertError) throw new Error(insertError.message);
      }

      if (resource === "devices") {
        const { error: insertError } = await supabase.from("devices").insert({
          store_id: DEFAULT_STORE_ID,
          device_code: draft.device_code.trim(),
          name: draft.name.trim(),
          device_type: draft.device_type.trim() || "etc",
          status: draft.status.trim() || "available",
          last_serviced_on: draft.last_serviced_on.trim() || null
        });
        if (insertError) throw new Error(insertError.message);
      }

      if (resource === "members") {
        const phoneLast4 = draft.phone_last4.trim() || null;
        const { error: insertError } = await supabase.from("members").insert({
          primary_store_id: DEFAULT_STORE_ID,
          nickname: draft.nickname.trim(),
          phone_last4: phoneLast4,
          login_provider: draft.login_provider.trim() || "manual",
          age_group: draft.age_group.trim() || null,
          memo: draft.memo.trim() || null,
          is_guest: phoneLast4 === null
        });
        if (insertError) throw new Error(insertError.message);
      }

      setDraft(emptyRow);
      setMessage("Supabase에 저장했습니다.");
      await loadRows();
      if (resource === "bays") {
        await loadStoreOptions();
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "저장하지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const startEdit = (row: CrudRow) => {
    setEditingId(row.id);
    setEditDraft(row);
  };

  const updateRow = async () => {
    if (!editingId) return;

    setIsLoading(true);
    setError(null);
    setMessage(null);

    try {
      const supabase = createBrowserSupabaseClient();

      if (resource === "stores") {
        const bayCount = normalizeBayCount(editDraft.bay_count);
        const { error: updateError } = await supabase
          .from("stores")
          .update({
            code: editDraft.code.trim(),
            name: editDraft.name.trim(),
            address: editDraft.address.trim() || null,
            phone: editDraft.phone.trim() || null,
            status: editDraft.status.trim() || "active",
            updated_at: new Date().toISOString()
          })
          .eq("id", editingId);
        if (updateError) throw new Error(updateError.message);

        await ensureStoreBays(editingId, editDraft.name.trim(), bayCount);
        await syncStoreBayCount(editingId);
      }

      if (resource === "bays") {
        const { error: updateError } = await supabase
          .from("bays")
          .update({
            bay_code: editDraft.bay_code.trim(),
            display_name: editDraft.display_name.trim() || editDraft.bay_code.trim(),
            status: editDraft.status.trim() || "available",
            memo: editDraft.memo.trim() || null,
            updated_at: new Date().toISOString()
          })
          .eq("id", editingId);
        if (updateError) throw new Error(updateError.message);
      }

      if (resource === "reservations") {
        const bayId = await getBayIdByCode(editDraft.bay_code);
        const { error: updateError } = await supabase
          .from("reservations")
          .update({
            bay_id: bayId,
            guest_name: editDraft.guest_name.trim() || "현장 고객",
            starts_at: toIsoFromLocal(editDraft.starts_at),
            ends_at: addMinutes(editDraft.starts_at, 60),
            party_size: Number(editDraft.party_size || 1),
            channel: editDraft.channel.trim() || "admin",
            status: editDraft.status.trim() || "requested",
            approval_required: isApprovalRequired(editDraft.approval_policy),
            memo: editDraft.memo.trim() || null,
            updated_at: new Date().toISOString()
          })
          .eq("id", editingId);
        if (updateError) throw new Error(updateError.message);
      }

      if (resource === "devices") {
        const { error: updateError } = await supabase
          .from("devices")
          .update({
            device_code: editDraft.device_code.trim(),
            name: editDraft.name.trim(),
            device_type: editDraft.device_type.trim() || "etc",
            status: editDraft.status.trim() || "available",
            last_serviced_on: editDraft.last_serviced_on.trim() || null,
            updated_at: new Date().toISOString()
          })
          .eq("id", editingId);
        if (updateError) throw new Error(updateError.message);
      }

      if (resource === "members") {
        const phoneLast4 = editDraft.phone_last4.trim() || null;
        const { error: updateError } = await supabase
          .from("members")
          .update({
            nickname: editDraft.nickname.trim(),
            phone_last4: phoneLast4,
            login_provider: editDraft.login_provider.trim() || "manual",
            age_group: editDraft.age_group.trim() || null,
            memo: editDraft.memo.trim() || null,
            is_guest: phoneLast4 === null,
            updated_at: new Date().toISOString()
          })
          .eq("id", editingId);
        if (updateError) throw new Error(updateError.message);
      }

      setEditingId(null);
      setEditDraft(emptyRow);
      setMessage("수정 내용을 Supabase에 저장했습니다.");
      await loadRows();
      if (resource === "bays") {
        await loadStoreOptions();
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "수정하지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const deleteRow = async (rowId: string) => {
    setIsLoading(true);
    setError(null);
    setMessage(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: deletedRows, error: deleteError } = await supabase.from(resource).delete().eq("id", rowId).select("id");

      if (deleteError) throw new Error(deleteError.message);

      if (!deletedRows || deletedRows.length === 0) {
        throw new Error("삭제된 행이 없습니다. Supabase RLS 삭제 정책이 적용됐는지 확인해주세요.");
      }

      if (resource === "bays") {
        await syncStoreBayCount(selectedStoreId);
      }

      setMessage("Supabase에서 삭제했습니다.");
      await loadRows();
      if (resource === "bays") {
        await loadStoreOptions();
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "삭제하지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const renderInput = (field: CrudField, value: string, onChange: (value: string) => void) => {
    if (field.type === "select" && field.options) {
      return (
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="rounded-md border border-[#cad8c6] bg-[#fbfcfa] px-3 py-3 font-semibold outline-none focus:border-vista-leaf"
        >
          <option value="">선택</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }

    return (
      <input
        type={field.type ?? "text"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-[#cad8c6] bg-[#fbfcfa] px-3 py-3 font-semibold outline-none focus:border-vista-leaf"
        placeholder={field.placeholder ?? `${field.label} 입력`}
      />
    );
  };

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <section className="rounded-md border border-[#dfe8dc] bg-white p-6 shadow-soft-line">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="grid size-14 shrink-0 place-items-center rounded-md bg-vista-leaf text-white">
                <Database size={28} aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-bold text-vista-leaf">{tableName} 테이블 실제 연결</p>
                <h1 className="mt-1 text-3xl font-extrabold">{title}</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#697468]">{description}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-md bg-vista-fairway px-4 py-3 text-sm font-bold text-vista-leaf">
              <CheckCircle2 size={18} aria-hidden="true" />
              Supabase CRUD 연결
            </div>
          </div>
        </section>

        {error ? (
          <section className="mt-5 flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">
            <AlertTriangle className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
            <span>{error}</span>
          </section>
        ) : null}

        {message ? (
          <section className="mt-5 flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
            <CheckCircle2 className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
            <span>{message}</span>
          </section>
        ) : null}

        {resource === "bays" ? (
          <section className="mt-5 rounded-md border border-[#dfe8dc] bg-white p-5 shadow-soft-line">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-bold text-vista-leaf">매장별 타석관리</p>
                <h2 className="mt-1 text-xl font-extrabold">관리할 매장을 선택하세요</h2>
                <p className="mt-1 text-sm text-[#697468]">
                  선택한 매장의 타석만 조회, 등록, 수정, 삭제됩니다. 타석 추가·삭제 결과는 매장관리의 타석수와 함께 동기화됩니다.
                </p>
              </div>
              <label className="grid gap-1 text-sm font-bold text-[#4f5b50] lg:min-w-[320px]">
                관리 매장
                <select
                  value={selectedStoreId}
                  onChange={(event) => setSelectedStoreId(event.target.value)}
                  className="rounded-md border border-[#cad8c6] bg-[#fbfcfa] px-3 py-3 font-semibold outline-none focus:border-vista-leaf"
                >
                  {storeOptions.length === 0 ? (
                    <option value={DEFAULT_STORE_ID}>비스타파크골프 시흥점</option>
                  ) : (
                    storeOptions.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name ?? store.code ?? "이름 없는 매장"} · 타석 {store.bay_count ?? 0}개
                      </option>
                    ))
                  )}
                </select>
              </label>
            </div>
            <div className="mt-4 rounded-md bg-vista-fairway px-4 py-3 text-sm font-semibold text-[#4f5b50]">
              현재 선택: {selectedStore?.name ?? "비스타파크골프 시흥점"} / 등록 타석 {rows.length}개 / 매장관리 기준{" "}
              {selectedStore?.bay_count ?? rows.length}개
            </div>
          </section>
        ) : null}

        <section className="mt-5 grid gap-5 xl:grid-cols-[360px_1fr]">
          <article className="rounded-md border border-[#dfe8dc] bg-white p-5 shadow-soft-line">
            <h2 className="text-lg font-extrabold">신규 등록</h2>
            <div className="mt-4 grid gap-3">
              {fields.map((field) => (
                <label key={field.key} className="grid gap-1 text-sm font-bold text-[#4f5b50]">
                  {field.label}
                  {renderInput(field, draft[field.key] ?? "", (value) => setDraft((current) => ({ ...current, [field.key]: value })))}
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={addRow}
              disabled={isLoading}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-vista-leaf px-4 py-3 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus size={18} aria-hidden="true" />
              Supabase에 추가
            </button>
          </article>

          <article className="rounded-md border border-[#dfe8dc] bg-white shadow-soft-line">
            <div className="flex flex-col gap-3 border-b border-[#e5ece1] p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-extrabold">목록 및 상태 관리</h2>
                <p className="mt-1 text-sm text-[#697468]">조회, 등록, 수정, 삭제가 Supabase에 바로 반영됩니다.</p>
              </div>
              <button
                type="button"
                onClick={loadRows}
                disabled={isLoading}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-[#cad8c6] bg-white px-4 py-2 text-sm font-bold disabled:opacity-60"
              >
                <RefreshCw size={16} aria-hidden="true" />
                새로고침
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="bg-vista-fairway text-[#566153]">
                  <tr>
                    {fields.map((field) => (
                      <th key={field.key} className="px-5 py-3 font-extrabold">
                        {field.label}
                      </th>
                    ))}
                    <th className="px-5 py-3 font-extrabold">작업</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf2ea]">
                  {rows.map((row) => {
                    const isEditing = editingId === row.id;

                    return (
                      <tr key={row.id} className="hover:bg-[#fbfcfa]">
                        {fields.map((field) => (
                          <td key={field.key} className="px-5 py-4 font-semibold">
                            {isEditing
                              ? renderInput(field, editDraft[field.key] ?? "", (value) =>
                                  setEditDraft((current) => ({ ...current, [field.key]: value }))
                                )
                              : row[field.key] || "-"}
                          </td>
                        ))}
                        <td className="px-5 py-4">
                          {isEditing ? (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={updateRow}
                                disabled={isLoading}
                                className="inline-flex items-center gap-2 rounded-md bg-vista-leaf px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
                              >
                                <Save size={14} aria-hidden="true" />
                                저장
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(null);
                                  setEditDraft(emptyRow);
                                }}
                                className="inline-flex items-center gap-2 rounded-md border border-[#cad8c6] bg-white px-3 py-2 text-xs font-bold"
                              >
                                <X size={14} aria-hidden="true" />
                                취소
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => startEdit(row)}
                                className="inline-flex items-center gap-2 rounded-md border border-[#cad8c6] bg-white px-3 py-2 text-xs font-bold"
                              >
                                <Pencil size={14} aria-hidden="true" />
                                수정
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteRow(row.id)}
                                disabled={isLoading}
                                className="inline-flex items-center gap-2 rounded-md border border-[#e7c7c7] bg-[#fff8f8] px-3 py-2 text-xs font-bold text-[#a14a4a] disabled:opacity-60"
                              >
                                <Trash2 size={14} aria-hidden="true" />
                                삭제
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}
