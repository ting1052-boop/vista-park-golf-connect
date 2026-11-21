import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoundSummary } from "@/lib/dashboard-data";

type DailyRow = {
  day: string;
  bay_id: string;
  started: number | string;
  counted_games: number | string;
  partial: number | string;
  practice_count: number | string;
  practice_minutes: number | string;
};
type PendingRow = { bay_id: string; pending_count: number | string; oldest_pending_date: string | null };

export function koreanDate(offsetDays = 0, now = new Date()) {
  const shifted = new Date(now.getTime() + offsetDays * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(shifted);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

const empty = (): RoundSummary => ({
  todayStarted: 0, yesterdayCounted: 0, yesterdayPartial: 0,
  todayPracticeCount: 0, todayPracticeMinutes: 0, pendingCount: 0
});

export async function getAgentRoundSummaries(supabase: SupabaseClient, storeId: string) {
  const today = koreanDate();
  const yesterday = koreanDate(-1);
  const [daily, pending, parkBays] = await Promise.all([
    supabase.rpc("agent_round_daily_counts", { p_store_id: storeId, p_from: yesterday, p_to: today }),
    supabase.rpc("agent_round_pending", { p_store_id: storeId }),
    supabase.from("bay_pc_registry").select("bay_id").eq("store_id", storeId).eq("pc_type", "park")
  ]);
  if (daily.error || pending.error || parkBays.error) throw new Error((daily.error ?? pending.error ?? parkBays.error)?.message ?? "라운드 집계를 불러오지 못했습니다.");

  const byBay = new Map<string, RoundSummary>();
  for (const row of parkBays.data ?? []) byBay.set(row.bay_id, empty());
  for (const row of (daily.data ?? []) as DailyRow[]) {
    const summary = byBay.get(row.bay_id) ?? empty();
    if (row.day === today) {
      summary.todayStarted += Number(row.started);
      summary.todayPracticeCount += Number(row.practice_count);
      summary.todayPracticeMinutes += Number(row.practice_minutes);
    } else if (row.day === yesterday) {
      summary.yesterdayCounted += Number(row.counted_games);
      summary.yesterdayPartial += Number(row.partial);
    }
    byBay.set(row.bay_id, summary);
  }
  for (const row of (pending.data ?? []) as PendingRow[]) {
    const summary = byBay.get(row.bay_id) ?? empty();
    summary.pendingCount = Number(row.pending_count);
    summary.oldestPendingDate = row.oldest_pending_date ?? undefined;
    byBay.set(row.bay_id, summary);
  }
  return byBay;
}
