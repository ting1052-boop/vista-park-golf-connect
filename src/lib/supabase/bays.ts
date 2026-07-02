import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import type { LiveBay, LiveBayStatus } from "@/lib/dashboard-data";

type BayRow = {
  id: string;
  store_id: string;
  bay_code: string;
  display_name: string;
  status: string;
  memo: string | null;
  last_checked_at: string | null;
  created_at?: string;
  updated_at?: string;
};

type BayUpdateResult = {
  data: LiveBay | null;
  error: Error | null;
};

const liveStatusSet = new Set<LiveBayStatus>(["in_use", "available", "waiting", "maintenance"]);

function createSupabaseDataClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase 환경변수가 설정되지 않았습니다.");
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

function normalizeBayStatus(status: string): LiveBayStatus {
  if (liveStatusSet.has(status as LiveBayStatus)) {
    return status as LiveBayStatus;
  }

  if (status === "cleaning") {
    return "waiting";
  }

  return "available";
}

function getBayZone(bayCode: string) {
  const [zone] = bayCode.split("-");
  return zone ? `${zone}구역` : "공용구역";
}

function getMode(status: LiveBayStatus) {
  switch (status) {
    case "in_use":
      return "이용 중";
    case "waiting":
      return "입장 대기";
    case "maintenance":
      return "점검 필요";
    case "available":
    default:
      return "즉시 배정 가능";
  }
}

function getDefaultNote(status: LiveBayStatus) {
  switch (status) {
    case "in_use":
      return "타석 이용 세션 진행 중";
    case "waiting":
      return "예약 또는 현장 입장 확인 대기";
    case "maintenance":
      return "장비 점검 또는 관리자 확인 필요";
    case "available":
    default:
      return "예약 배정 가능 상태";
  }
}

function mapBayRow(row: BayRow): LiveBay {
  const status = normalizeBayStatus(row.status);

  return {
    id: row.id,
    name: row.bay_code || row.display_name,
    zone: getBayZone(row.bay_code || row.display_name),
    status,
    nextReservation: status === "available" ? "예약 배정 가능" : undefined,
    mode: getMode(status),
    note: row.memo ?? getDefaultNote(status)
  };
}

export async function getBays(storeId?: string): Promise<LiveBay[]> {
  const supabase = createSupabaseDataClient();

  let query = supabase
    .from("bays")
    .select("id, store_id, bay_code, display_name, status, memo, last_checked_at, created_at, updated_at")
    .order("bay_code", { ascending: true });

  if (storeId) {
    query = query.eq("store_id", storeId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapBayRow(row as BayRow));
}

export async function updateBayStatus(bayId: string, status: LiveBayStatus): Promise<BayUpdateResult> {
  try {
    const supabase = createSupabaseDataClient();
    const { data, error } = await supabase
      .from("bays")
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq("id", bayId)
      .select("id, store_id, bay_code, display_name, status, memo, last_checked_at, created_at, updated_at")
      .single();

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: mapBayRow(data as BayRow), error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error("타석 상태 업데이트 중 알 수 없는 오류가 발생했습니다.")
    };
  }
}

export function subscribeToBays(callback: (bay: LiveBay) => void, storeId?: string): () => void {
  const supabase = createSupabaseDataClient();
  const postgresChangesConfig = {
    event: "*",
    schema: "public",
    table: "bays",
    ...(storeId ? { filter: `store_id=eq.${storeId}` } : {})
  } as const;
  let channel: RealtimeChannel | null = supabase
    .channel(storeId ? `vista-bays-realtime-${storeId}` : "vista-bays-realtime")
    .on(
      "postgres_changes",
      postgresChangesConfig,
      (payload) => {
        if (!payload.new || !("id" in payload.new)) {
          return;
        }

        callback(mapBayRow(payload.new as BayRow));
      }
    )
    .subscribe();

  return () => {
    if (!channel) {
      return;
    }

    void supabase.removeChannel(channel);
    channel = null;
  };
}
