import { NextRequest, NextResponse } from "next/server";
import { getBearerToken } from "@/lib/agent-server";
import { listOpenEnrollmentStoreIds } from "@/lib/pc-enrollment";
import { matchesGlobalSetupToken } from "@/lib/pc-registry";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type StoreRow = { id: string; code: string; name: string; status: string };
type BayRow = { id: string; store_id: string; bay_code: string; display_name: string | null };
type RegistryRow = { bay_id: string; pc_type: string; computer_name: string };

/**
 * 세팅 도구의 매장·타석 드롭다운용 목록.
 * 현장에서 storeCode 와 bayCode 를 손으로 적으면 오타가 난다.
 *
 * 전역 토큰이면 전 매장을 돌려준다. 토큰이 없으면 등록 창구가 열린 매장만
 * 돌려준다. 창이 하나도 안 열려 있으면 아무것도 보여주지 않는다.
 *
 * 장비 토큰으로는 열 수 없다. 장비 토큰은 자기 장비만 갱신하는 권한이고,
 * 이 응답은 매장 타석 목록이다.
 */
export async function GET(request: NextRequest) {
  const token = getBearerToken(request);
  const isGlobal = Boolean(token && matchesGlobalSetupToken(token));

  let supabase;
  try {
    supabase = createSupabaseAdminClient();
  } catch (caught) {
    return NextResponse.json(
      { ok: false, code: "server_error", message: caught instanceof Error ? caught.message : "서버 설정 오류" },
      { status: 500 }
    );
  }

  let allowedStoreIds: string[] | null = null;
  if (!isGlobal) {
    allowedStoreIds = await listOpenEnrollmentStoreIds(supabase);
    if (allowedStoreIds.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          code: "enrollment_closed",
          message: "지금은 PC 등록 창구가 열린 매장이 없습니다. 관리자 화면 원격접속에서 등록을 허용해주세요."
        },
        { status: 401 }
      );
    }
  }

  const [storeResult, bayResult, registryResult] = await Promise.all([
    supabase.from("stores").select("id, code, name, status").order("code", { ascending: true }),
    supabase.from("bays").select("id, store_id, bay_code, display_name").order("bay_code", { ascending: true }),
    supabase.from("bay_pc_registry").select("bay_id, pc_type, computer_name")
  ]);

  if (storeResult.error || bayResult.error) {
    return NextResponse.json(
      { ok: false, code: "server_error", message: (storeResult.error ?? bayResult.error)?.message ?? "조회 실패" },
      { status: 500 }
    );
  }

  // 등록부는 아직 마이그레이션이 안 된 환경에서도 목록만은 나와야 한다.
  const registered = new Map<string, RegistryRow>();
  for (const row of (registryResult.data ?? []) as RegistryRow[]) {
    registered.set(row.bay_id, row);
  }

  const baysByStore = new Map<string, BayRow[]>();
  for (const bay of (bayResult.data ?? []) as BayRow[]) {
    const list = baysByStore.get(bay.store_id) ?? [];
    list.push(bay);
    baysByStore.set(bay.store_id, list);
  }

  const stores = ((storeResult.data ?? []) as StoreRow[])
    .filter((store) => store.status !== "closed")
    .filter((store) => allowedStoreIds === null || allowedStoreIds.includes(store.id))
    .map((store) => ({
      id: store.id,
      code: store.code,
      name: store.name,
      bays: (baysByStore.get(store.id) ?? []).map((bay) => {
        const current = registered.get(bay.id);
        return {
          id: bay.id,
          bayCode: bay.bay_code,
          name: bay.display_name ?? bay.bay_code,
          // 이미 등록된 타석이면 세팅 도구가 기존 선택을 미리 채울 수 있다.
          registered: Boolean(current),
          pcType: current?.pc_type ?? null,
          computerName: current?.computer_name ?? null
        };
      })
    }));

  return NextResponse.json({ ok: true, stores });
}
