import { getBays } from "@/lib/supabase/bays";
import { getDashboardOperationalRows } from "@/lib/supabase/dashboard";
import { getStoreSummaries } from "@/lib/supabase/stores";
import { DashboardClient } from "./dashboard-client";

const CURRENT_STORE_ID = "11111111-1111-4111-8111-111111111111";

export default async function AdminDashboardPage() {
  const [bayResult, storeResult, dashboardResult] = await Promise.allSettled([
    getBays(CURRENT_STORE_ID),
    getStoreSummaries(),
    getDashboardOperationalRows(CURRENT_STORE_ID)
  ]);
  const bays = bayResult.status === "fulfilled" ? bayResult.value : [];
  const stores = storeResult.status === "fulfilled" ? storeResult.value : [];
  const dashboardRows =
    dashboardResult.status === "fulfilled"
      ? dashboardResult.value
      : {
          reservations: [],
          alerts: [],
          noShows: [],
          todaySummary: { total: 0, app: 0, walkInPhone: 0 }
        };
  const errors = [
    bayResult.status === "rejected"
      ? `타석 상태를 불러오지 못했습니다: ${bayResult.reason instanceof Error ? bayResult.reason.message : "알 수 없는 오류"}`
      : null,
    storeResult.status === "rejected"
      ? `매장 현황을 불러오지 못했습니다: ${storeResult.reason instanceof Error ? storeResult.reason.message : "알 수 없는 오류"}`
      : null,
    dashboardResult.status === "rejected"
      ? `오늘 예약 현황을 불러오지 못했습니다: ${dashboardResult.reason instanceof Error ? dashboardResult.reason.message : "알 수 없는 오류"}`
      : null
  ].filter(Boolean);

  return (
    <DashboardClient
      currentStoreId={CURRENT_STORE_ID}
      initialBays={bays}
      initialStoreSummaries={stores}
      initialReservations={dashboardRows.reservations}
      initialAlerts={dashboardRows.alerts}
      initialNoShows={dashboardRows.noShows}
      initialTodayReservationSummary={dashboardRows.todaySummary}
      initialError={errors.length > 0 ? errors.join(" / ") : null}
    />
  );
}
