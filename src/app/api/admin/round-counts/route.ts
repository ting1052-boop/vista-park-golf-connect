import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin-context";
import { koreanDate } from "@/lib/agent-round-summary";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const context = await getAdminContext();
    if (!context.storeRoundCounting) return NextResponse.json({ ok: true, bays: [], rows: [] });
    const supabase = createSupabaseAdminClient();
    const [counts, bays, parkPcs] = await Promise.all([
      supabase.rpc("agent_round_daily_counts", { p_store_id: context.storeId, p_from: koreanDate(-13), p_to: koreanDate() }),
      supabase.from("bays").select("id, display_name, bay_code").eq("store_id", context.storeId).order("bay_code"),
      supabase.from("bay_pc_registry").select("bay_id").eq("store_id", context.storeId).eq("pc_type", "park")
    ]);
    if (counts.error || bays.error || parkPcs.error) throw new Error((counts.error ?? bays.error ?? parkPcs.error)?.message ?? "일별 게임 수 조회 실패");
    const parkIds = new Set((parkPcs.data ?? []).map((row) => row.bay_id));
    return NextResponse.json({ ok: true, bays: (bays.data ?? []).filter((bay) => parkIds.has(bay.id)), rows: counts.data ?? [] });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "일별 게임 수 조회 실패" }, { status: 500 });
  }
}
