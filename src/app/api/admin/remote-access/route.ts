import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type RegistryRow = {
  device_id: string;
  store_id: string;
  bay_id: string;
  pc_type: string;
  computer_name: string;
  anydesk_id: string;
  windows_edition: string | null;
  windows_version: string | null;
  activation_status: string;
  setup_tool_version: string | null;
  registered_at: string;
  updated_at: string;
};

type HistoryRow = {
  id: string;
  device_id: string;
  bay_id: string | null;
  previous_anydesk_id: string | null;
  new_anydesk_id: string;
  changed_at: string;
  change_source: string;
};

export async function GET(request: NextRequest) {
  try {
    await requireAdminUser();
  } catch {
    return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  let supabase;
  try {
    supabase = createSupabaseAdminClient();
  } catch (caught) {
    return NextResponse.json(
      { ok: false, message: caught instanceof Error ? caught.message : "서버 설정 오류" },
      { status: 500 }
    );
  }

  const deviceId = request.nextUrl.searchParams.get("deviceId");

  // device_token_hash 는 어떤 경우에도 고르지 않는다.
  const columns =
    "device_id, store_id, bay_id, pc_type, computer_name, anydesk_id, windows_edition, windows_version, activation_status, setup_tool_version, registered_at, updated_at";

  const [registryResult, historyResult, storeResult, bayResult] = await Promise.all([
    supabase.from("bay_pc_registry").select(columns).order("registered_at", { ascending: false }),
    deviceId
      ? supabase
          .from("bay_pc_anydesk_history")
          .select("id, device_id, bay_id, previous_anydesk_id, new_anydesk_id, changed_at, change_source")
          .eq("device_id", deviceId)
          .order("changed_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("stores").select("id, code, name"),
    supabase.from("bays").select("id, bay_code, display_name")
  ]);

  if (registryResult.error) {
    return NextResponse.json({ ok: false, message: registryResult.error.message }, { status: 500 });
  }

  const storeById = new Map(
    ((storeResult.data ?? []) as Array<{ id: string; code: string; name: string }>).map((row) => [row.id, row])
  );
  const bayById = new Map(
    ((bayResult.data ?? []) as Array<{ id: string; bay_code: string; display_name: string | null }>).map((row) => [
      row.id,
      row
    ])
  );

  const devices = ((registryResult.data ?? []) as RegistryRow[]).map((row) => {
    const store = storeById.get(row.store_id);
    const bay = bayById.get(row.bay_id);
    return {
      deviceId: row.device_id,
      bayId: row.bay_id,
      storeName: store?.name ?? "알 수 없는 매장",
      storeCode: store?.code ?? null,
      bayCode: bay?.bay_code ?? "-",
      bayName: bay?.display_name ?? null,
      pcType: row.pc_type,
      computerName: row.computer_name,
      anydeskId: row.anydesk_id,
      windowsEdition: row.windows_edition,
      windowsVersion: row.windows_version,
      activationStatus: row.activation_status,
      setupToolVersion: row.setup_tool_version,
      registeredAt: row.registered_at,
      updatedAt: row.updated_at
    };
  });

  const history = ((historyResult.data ?? []) as HistoryRow[]).map((row) => ({
    id: row.id,
    deviceId: row.device_id,
    previousAnydeskId: row.previous_anydesk_id,
    newAnydeskId: row.new_anydesk_id,
    changedAt: row.changed_at,
    changeSource: row.change_source
  }));

  return NextResponse.json({ ok: true, devices, history });
}
