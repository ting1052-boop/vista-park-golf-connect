import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import { closeEnrollment, getEnrollmentState, openEnrollment } from "@/lib/pc-enrollment";
import { parseRegisterPayload } from "@/lib/pc-registry-payload";
import { registerBayPc } from "@/lib/pc-registry";
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
    supabase.from("stores").select("id, code, name").order("code"),
    supabase.from("bays").select("id, store_id, bay_code, display_name").order("bay_code")
  ]);

  if (registryResult.error) {
    return NextResponse.json({ ok: false, message: registryResult.error.message }, { status: 500 });
  }

  const storeRows = (storeResult.data ?? []) as Array<{ id: string; code: string; name: string }>;
  const bayRows = (bayResult.data ?? []) as Array<{
    id: string;
    store_id: string;
    bay_code: string;
    display_name: string | null;
  }>;

  const storeById = new Map(storeRows.map((row) => [row.id, row]));
  const bayById = new Map(bayRows.map((row) => [row.id, row]));

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

  // 수동 입력 폼의 매장·타석 드롭다운.
  const stores = storeRows.map((store) => ({
    id: store.id,
    code: store.code,
    name: store.name,
    bays: bayRows
      .filter((bay) => bay.store_id === store.id)
      .map((bay) => ({ id: bay.id, bayCode: bay.bay_code, name: bay.display_name ?? bay.bay_code }))
  }));

  // 매장별 등록 창구 상태. 창이 열린 동안만 세팅 도구가 토큰 없이 등록할 수 있다.
  const enrollment: Record<string, { open: boolean; until: string | null; remaining: number | null }> = {};
  let enrollmentSupported = true;
  for (const store of storeRows) {
    try {
      const state = await getEnrollmentState(supabase, store.id);
      enrollmentSupported = enrollmentSupported && state.supported;
      enrollment[store.id] = { open: state.open, until: state.until, remaining: state.remaining };
    } catch {
      enrollmentSupported = false;
    }
  }

  return NextResponse.json({ ok: true, devices, history, stores, enrollment, enrollmentSupported });
}

/**
 * 관리자 화면 수동 등록.
 *
 * 세팅 도구를 돌릴 수 없는 PC(이미 운영 중이거나 도구 배포 전)를 손으로 넣는다.
 * 중복 검사·이력 기록은 세팅 도구와 같은 경로를 탄다.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdminUser();
  } catch {
    return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, code: "invalid_payload", message: "요청 본문을 확인해주세요." }, { status: 400 });
  }

  // 등록 창구 열기·닫기. 수동 등록과 같은 라우트를 쓰되 action 으로 가른다.
  if (body.action === "open_enrollment" || body.action === "close_enrollment") {
    const storeId = typeof body.storeId === "string" ? body.storeId : null;
    if (!storeId) {
      return NextResponse.json({ ok: false, code: "invalid_payload", message: "매장을 선택해주세요." }, { status: 400 });
    }

    let supabaseAdmin;
    try {
      supabaseAdmin = createSupabaseAdminClient();
    } catch (caught) {
      return NextResponse.json(
        { ok: false, code: "server_error", message: caught instanceof Error ? caught.message : "서버 설정 오류" },
        { status: 500 }
      );
    }

    try {
      if (body.action === "close_enrollment") {
        await closeEnrollment(supabaseAdmin, storeId);
        return NextResponse.json({ ok: true, message: "등록 창구를 닫았습니다." });
      }

      const opened = await openEnrollment(supabaseAdmin, storeId, {
        minutes: typeof body.minutes === "number" ? body.minutes : undefined,
        count: typeof body.count === "number" ? body.count : undefined
      });
      return NextResponse.json({
        ok: true,
        message: `${opened.minutes}분간 최대 ${opened.remaining}대까지 등록을 허용합니다.`,
        ...opened
      });
    } catch (caught) {
      return NextResponse.json(
        { ok: false, code: "server_error", message: caught instanceof Error ? caught.message : "등록 창구를 바꾸지 못했습니다." },
        { status: 500 }
      );
    }
  }

  // 손으로 넣는 PC 에는 하드웨어 해시가 없다. 임의 식별자를 만들어 준다.
  // 나중에 그 PC 가 세팅 도구로 진짜 deviceId 를 들고 오면 같은 타석이라
  // slot_occupied 가 나고, 관리자가 교체를 확인하면 진짜 값으로 바뀐다.
  const parsed = parseRegisterPayload({
    ...body,
    deviceId: typeof body.deviceId === "string" && body.deviceId ? body.deviceId : randomBytes(32).toString("hex"),
    // 이 줄이 사람이 손으로 넣은 것임을 화면에서 알 수 있게 한다.
    setupToolVersion: "manual"
  });

  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, code: parsed.error.code, message: parsed.error.message, field: parsed.error.field },
      { status: 400 }
    );
  }

  let supabase;
  try {
    supabase = createSupabaseAdminClient();
  } catch (caught) {
    return NextResponse.json(
      { ok: false, code: "server_error", message: caught instanceof Error ? caught.message : "서버 설정 오류" },
      { status: 500 }
    );
  }

  const outcome = await registerBayPc(supabase, parsed.payload, { kind: "admin" });

  if (!outcome.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: outcome.error.code,
        message: outcome.error.message,
        conflict: outcome.error.conflict ?? null
      },
      { status: outcome.error.status }
    );
  }

  // 장비 토큰은 admin 등록에서 발급되지 않으므로(registerBayPc) 항상 null 이다.
  return NextResponse.json({ ok: true, ...outcome.result, deviceToken: null });
}
