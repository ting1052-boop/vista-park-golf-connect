import { liveBayRows, storeSummaryRows } from "@/lib/dashboard-data";
import { getBays } from "@/lib/supabase/bays";
import { getStoreSummaries } from "@/lib/supabase/stores";
import { DashboardClient } from "./dashboard-client";

const CURRENT_STORE_ID = "11111111-1111-4111-8111-111111111111";

export default async function AdminDashboardPage() {
  const [bayResult, storeResult] = await Promise.allSettled([getBays(CURRENT_STORE_ID), getStoreSummaries()]);
  const bays = bayResult.status === "fulfilled" && bayResult.value.length > 0 ? bayResult.value : liveBayRows;
  const stores = storeResult.status === "fulfilled" && storeResult.value.length > 0 ? storeResult.value : storeSummaryRows;
  const errors = [
    bayResult.status === "rejected"
      ? `타석 상태를 불러오지 못했습니다: ${bayResult.reason instanceof Error ? bayResult.reason.message : "알 수 없는 오류"}`
      : null,
    storeResult.status === "rejected"
      ? `매장 현황을 불러오지 못했습니다: ${storeResult.reason instanceof Error ? storeResult.reason.message : "알 수 없는 오류"}`
      : null
  ].filter(Boolean);

  return (
    <DashboardClient
      currentStoreId={CURRENT_STORE_ID}
      initialBays={bays}
      initialStoreSummaries={stores}
      initialError={errors.length > 0 ? `${errors.join(" / ")} 기존 샘플 데이터를 표시합니다.` : null}
    />
  );
}
