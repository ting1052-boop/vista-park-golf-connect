import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin-context";
import { koreanDate } from "@/lib/agent-round-summary";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { parseRoundCountRange } from "./range";

// 읽기 전용. ?from=YYYY-MM-DD&to=YYYY-MM-DD (기본: 최근 14일). 값은 agent_round_daily_counts 그대로 돌려준다.
export async function GET(request: Request) {
  try {
    const context = await getAdminContext();
    const range = parseRoundCountRange(new URL(request.url).searchParams, koreanDate(-13), koreanDate());
    if ("error" in range) return NextResponse.json({ ok: false, message: range.error }, { status: 400 });
    if (!context.storeRoundCounting) return NextResponse.json({ ok: true, enabled: false, ...range, bays: [], rows: [] });
    const supabase = createSupabaseAdminClient();
    const [counts, bays, parkPcs] = await Promise.all([
      supabase.rpc("agent_round_daily_counts", { p_store_id: context.storeId, p_from: range.from, p_to: range.to }),
      supabase.from("bays").select("id, display_name, bay_code").eq("store_id", context.storeId).order("bay_code"),
      supabase.from("bay_pc_registry").select("bay_id").eq("store_id", context.storeId).eq("pc_type", "park")
    ]);
    if (counts.error || bays.error || parkPcs.error) throw new Error((counts.error ?? bays.error ?? parkPcs.error)?.message ?? "일별 게임 수 조회 실패");
    const parkIds = new Set((parkPcs.data ?? []).map((row) => row.bay_id));
    return NextResponse.json({ ok: true, enabled: true, ...range, bays: (bays.data ?? []).filter((bay) => parkIds.has(bay.id)), rows: counts.data ?? [] });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "일별 게임 수 조회 실패" }, { status: 500 });
  }
}
