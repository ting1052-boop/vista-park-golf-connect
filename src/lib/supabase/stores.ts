import { createClient } from "@supabase/supabase-js";

export type StoreSummary = {
  id: string;
  store: string;
  address: string;
  phone: string;
  bayCount: number;
  status: string;
};

type StoreRow = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  bay_count: number | null;
  status: string | null;
};

function createSupabaseDataClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase 환경변수가 설정되지 않았습니다.");
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

function getStoreStatusLabel(status: string | null) {
  if (status === "active") return "운영 중";
  if (status === "paused") return "일시 중지";
  if (status === "closed") return "운영 종료";
  return "상태 확인";
}

export async function getStoreSummaries(): Promise<StoreSummary[]> {
  const supabase = createSupabaseDataClient();

  const { data, error } = await supabase
    .from("stores")
    .select("id, name, address, phone, bay_count, status")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as StoreRow[]).map((store) => ({
    id: store.id,
    store: store.name,
    address: store.address ?? "주소 미등록",
    phone: store.phone ?? "전화번호 미등록",
    bayCount: store.bay_count ?? 0,
    status: getStoreStatusLabel(store.status)
  }));
}
