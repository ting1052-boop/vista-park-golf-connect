import { commonAutomationScripts } from "@/lib/automation/device-map";
import { getAutomationDeviceStatuses, getLatestScriptRuns, getPowerState } from "@/lib/supabase/automation-status";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getDashboardBays } from "@/lib/supabase/bays-server";
import { getDashboardOperationalRows } from "@/lib/supabase/dashboard";
import { redirect } from "next/navigation";
import { getOptionalAdminContext, listAdminStores } from "@/lib/admin-context";
import { DashboardClient, type OpenRound } from "./dashboard-client";

// 카드의 "N분째" 계산용: 매장의 12시간 이내 열린 코스 판(타석별 최신 1건). 실패하면 분 표시만 빠진다.
async function getOpenCourseRounds(storeId: string) {
  const { data, error } = await createSupabaseAdminClient()
    .from("agent_rounds")
    .select("bay_id, course_id, started_at")
    .eq("store_id", storeId)
    .eq("status", "open")
    .eq("kind", "course")
    .gte("started_at", new Date(Date.now() - 12 * 3_600_000).toISOString())
    .order("started_at", { ascending: false });
  if (error) return {};
  const byBay: Record<string, OpenRound> = {};
  for (const row of data ?? []) byBay[row.bay_id] ??= { courseId: row.course_id, startedAt: row.started_at };
  return byBay;
}

// Always derive the dashboard from current sessions, never a static build snapshot.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminDashboardPage() {
  // 관리자 역할이 없으면(고객 로그인 등) 조용히 로그인으로 돌려보낸다.
  const adminContext = await getOptionalAdminContext();
  if (!adminContext) redirect("/admin/login");
  const currentStoreId = adminContext.storeId;
  const stores = await listAdminStores(adminContext);
  const [bayResult, dashboardResult, automationResult, sharedPowerResult, roundResult] = await Promise.allSettled([
    getDashboardBays(currentStoreId),
    getDashboardOperationalRows(currentStoreId),
    getAutomationDeviceStatuses(currentStoreId),
    // Command history, not physical lighting/HVAC power feedback.
    getLatestScriptRuns(createSupabaseAdminClient(), currentStoreId, true).then((runs) =>
      getPowerState(runs, commonAutomationScripts.on, commonAutomationScripts.off)
    ),
    adminContext.storeRoundCounting ? getOpenCourseRounds(currentStoreId) : Promise.resolve({} as Record<string, OpenRound>)
  ]);
  const openRounds = roundResult.status === "fulfilled" ? roundResult.value : {};
  const bays = bayResult.status === "fulfilled" ? bayResult.value : [];
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
    dashboardResult.status === "rejected"
      ? `오늘 예약 현황을 불러오지 못했습니다: ${dashboardResult.reason instanceof Error ? dashboardResult.reason.message : "알 수 없는 오류"}`
      : null,
    automationResult.status === "rejected"
      ? `장비 상태를 불러오지 못했습니다: ${automationResult.reason instanceof Error ? automationResult.reason.message : "알 수 없는 오류"}`
      : null
  ].filter(Boolean);

  return (
    <DashboardClient
      currentStoreId={currentStoreId}
      adminContext={adminContext}
      stores={stores}
      initialBays={bays}
      openRounds={openRounds}
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
