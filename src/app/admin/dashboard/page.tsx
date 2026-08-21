import { commonAutomationScripts } from "@/lib/automation/device-map";
import { getAutomationDeviceStatuses, getLatestScriptRuns, getPowerState } from "@/lib/supabase/automation-status";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getDashboardBays } from "@/lib/supabase/bays-server";
import { getDashboardOperationalRows } from "@/lib/supabase/dashboard";
import { getStoreSummaries } from "@/lib/supabase/stores";
import { DashboardClient } from "./dashboard-client";

const CURRENT_STORE_ID = "11111111-1111-4111-8111-111111111111";

// Always derive the dashboard from current sessions, never a static build snapshot.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminDashboardPage() {
  const [bayResult, storeResult, dashboardResult, automationResult, sharedPowerResult] = await Promise.allSettled([
    getDashboardBays(CURRENT_STORE_ID),
    getStoreSummaries(),
    getDashboardOperationalRows(CURRENT_STORE_ID),
    getAutomationDeviceStatuses(CURRENT_STORE_ID),
    // 공용 조명·냉난방의 현재 상태. 대시보드 조명 버튼이 ON/OFF 중 무엇을 보여줄지 결정한다.
    getLatestScriptRuns(createSupabaseAdminClient(), CURRENT_STORE_ID).then((runs) =>
      getPowerState(runs, commonAutomationScripts.on, commonAutomationScripts.off)
    )
  ]);
  const bays = bayResult.status === "fulfilled" ? bayResult.value : [];
  const stores = storeResult.status === "fulfilled" ? storeResult.value : [];
  const automationDevices = automationResult.status === "fulfilled" ? automationResult.value : [];
  const sharedPower =
    sharedPowerResult.status === "fulfilled"
      ? sharedPowerResult.value
      : { on: null, failed: false, lastRunAt: null };
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
      : null,
    automationResult.status === "rejected"
      ? `장비 상태를 불러오지 못했습니다: ${automationResult.reason instanceof Error ? automationResult.reason.message : "알 수 없는 오류"}`
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
      initialAutomationDevices={automationDevices}
      initialSharedPower={sharedPower}
      initialError={errors.length > 0 ? errors.join(" / ") : null}
    />
  );
}
