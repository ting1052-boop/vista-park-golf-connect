import { createHash, randomBytes, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RegisterPayload } from "@/lib/pc-registry-payload";

export type RegistryRow = {
  id: string;
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

// global: 세팅 도구가 전역 토큰으로. device: 자기 장비만. admin: 관리자 화면 수동 입력.
export type RegisterAuth = { kind: "global" } | { kind: "device"; deviceId: string } | { kind: "admin" };

export type RegisterFailure = {
  status: number;
  code:
    | "store_not_found"
    | "bay_not_found"
    | "anydesk_id_taken"
    | "slot_occupied"
    | "device_mismatch"
    | "server_error";
  message: string;
  conflict?: { deviceId: string; computerName: string; anydeskId: string; bayCode: string | null };
};

export type RegisterSuccess = {
  action: "created" | "updated" | "unchanged";
  storeId: string;
  bayId: string;
  bayCode: string;
  anydeskChanged: { from: string; to: string } | null;
  replacedDeviceId: string | null;
  warnings: Array<{ code: "computer_name_duplicate"; message: string; deviceIds: string[] }>;
  deviceToken: string | null;
  registeredAt: string;
};

export type RegisterResult = { ok: true; result: RegisterSuccess } | { ok: false; error: RegisterFailure };

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** 길이가 다르면 timingSafeEqual 이 던지므로 길이부터 비교한다. */
export function matchesGlobalSetupToken(token: string) {
  const expected = process.env.PC_SETUP_TOKEN;
  if (!expected || expected.length === 0) return false;

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(token);
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

/**
 * 토큰 하나로 인증 주체를 가른다. 전역 토큰은 어느 장비든 등록할 수 있고,
 * 장비 토큰은 자기 device_id 만 갱신할 수 있다.
 */
export async function resolveRegisterAuth(
  supabase: SupabaseClient,
  token: string
): Promise<RegisterAuth | null> {
  if (matchesGlobalSetupToken(token)) return { kind: "global" };

  const { data, error } = await supabase
    .from("bay_pc_registry")
    .select("device_id")
    .eq("device_token_hash", hashToken(token))
    .maybeSingle();

  if (error || !data) return null;
  return { kind: "device", deviceId: (data as { device_id: string }).device_id };
}

function fail(status: number, code: RegisterFailure["code"], message: string, conflict?: RegisterFailure["conflict"]): RegisterResult {
  return { ok: false, error: { status, code, message, conflict } };
}

export async function registerBayPc(
  supabase: SupabaseClient,
  payload: RegisterPayload,
  auth: RegisterAuth
): Promise<RegisterResult> {
  if (auth.kind === "device" && auth.deviceId !== payload.deviceId) {
    return fail(403, "device_mismatch", "이 토큰은 다른 장비의 정보를 수정할 수 없습니다.");
  }

  const store = await findStore(supabase, payload);
  if (!store) {
    return fail(404, "store_not_found", "등록된 매장이 아닙니다. 관리자 화면 매장관리에서 먼저 추가해주세요.");
  }

  const bay = await findBay(supabase, store.id, payload);
  if (!bay) {
    return fail(404, "bay_not_found", "등록된 타석이 아닙니다. 관리자 화면 타석관리에서 먼저 추가해주세요.");
  }

  // AnyDesk ID 는 한 장비에 하나뿐이다. replace 로도 넘어갈 수 없는 하드 에러다.
  const { data: anydeskOwner, error: anydeskError } = await supabase
    .from("bay_pc_registry")
    .select("device_id, computer_name, anydesk_id, bay_id")
    .eq("anydesk_id", payload.anydeskId)
    .neq("device_id", payload.deviceId)
    .maybeSingle();
  if (anydeskError) return fail(500, "server_error", anydeskError.message);
  if (anydeskOwner) {
    const owner = anydeskOwner as Pick<RegistryRow, "device_id" | "computer_name" | "anydesk_id">;
    return fail(409, "anydesk_id_taken", "이 AnyDesk ID 는 다른 장비에 이미 등록되어 있습니다.", {
      deviceId: owner.device_id,
      computerName: owner.computer_name,
      anydeskId: owner.anydesk_id,
      bayCode: null
    });
  }

  const { data: occupantRow, error: occupantError } = await supabase
    .from("bay_pc_registry")
    .select("device_id, computer_name, anydesk_id")
    .eq("bay_id", bay.id)
    .neq("device_id", payload.deviceId)
    .maybeSingle();
  if (occupantError) return fail(500, "server_error", occupantError.message);

  const occupant = occupantRow as Pick<RegistryRow, "device_id" | "computer_name" | "anydesk_id"> | null;
  if (occupant && !payload.replace) {
    return fail(409, "slot_occupied", `${bay.bay_code} 타석에는 이미 다른 PC(${occupant.computer_name})가 등록되어 있습니다.`, {
      deviceId: occupant.device_id,
      computerName: occupant.computer_name,
      anydeskId: occupant.anydesk_id,
      bayCode: bay.bay_code
    });
  }

  const { data: existingRow, error: existingError } = await supabase
    .from("bay_pc_registry")
    .select("id, device_id, store_id, bay_id, pc_type, computer_name, anydesk_id, windows_edition, windows_version, activation_status, setup_tool_version, registered_at, updated_at")
    .eq("device_id", payload.deviceId)
    .maybeSingle();
  if (existingError) return fail(500, "server_error", existingError.message);
  const existing = existingRow as RegistryRow | null;

  let replacedDeviceId: string | null = null;
  if (occupant && payload.replace) {
    const { error: deleteError } = await supabase
      .from("bay_pc_registry")
      .delete()
      .eq("device_id", occupant.device_id);
    if (deleteError) return fail(500, "server_error", deleteError.message);

    replacedDeviceId = occupant.device_id;
    await writeHistory(supabase, {
      deviceId: payload.deviceId,
      bayId: bay.id,
      previousAnydeskId: occupant.anydesk_id,
      newAnydeskId: payload.anydeskId,
      changeSource: "replace"
    });
  }

  const nowIso = new Date().toISOString();
  const facts = {
    store_id: store.id,
    bay_id: bay.id,
    pc_type: payload.pcType,
    computer_name: payload.computerName,
    anydesk_id: payload.anydeskId,
    windows_edition: payload.windowsEdition,
    windows_version: payload.windowsVersion,
    activation_status: payload.activationStatus,
    setup_tool_version: payload.setupToolVersion
  };

  // 전역 토큰으로 들어온 등록에는 장비 토큰을 새로 발급한다. 현장에서 장비
  // 토큰을 잃어버렸을 때 운영자가 전역 토큰으로 다시 받아갈 수 있어야 한다.
  // 관리자 수동 입력은 그 PC 가 앞으로 스스로 보고한다는 뜻이 아니므로 발급하지 않는다.
  const issuedToken = auth.kind === "global" ? randomBytes(32).toString("base64url") : null;
  const changeSource = auth.kind === "admin" ? "admin" : "setup_tool";
  const tokenColumns = issuedToken
    ? { device_token_hash: hashToken(issuedToken), device_token_issued_at: nowIso }
    : {};

  let action: RegisterSuccess["action"];
  let anydeskChanged: RegisterSuccess["anydeskChanged"] = null;

  if (!existing) {
    const { error: insertError } = await supabase
      .from("bay_pc_registry")
      .insert({ device_id: payload.deviceId, ...facts, ...tokenColumns, registered_at: nowIso });
    if (insertError) return fail(500, "server_error", insertError.message);

    action = "created";
    await writeHistory(supabase, {
      deviceId: payload.deviceId,
      bayId: bay.id,
      previousAnydeskId: null,
      newAnydeskId: payload.anydeskId,
      changeSource
    });
  } else {
    const unchanged = (Object.keys(facts) as Array<keyof typeof facts>).every(
      (key) => existing[key as keyof RegistryRow] === facts[key]
    );
    action = unchanged ? "unchanged" : "updated";

    // registered_at 은 값이 그대로여도 갱신한다. "이 PC 가 마지막으로 보고한 시각"이라
    // 변경 여부와는 다른 정보다.
    const { error: updateError } = await supabase
      .from("bay_pc_registry")
      .update({ ...facts, ...tokenColumns, registered_at: nowIso })
      .eq("device_id", payload.deviceId);
    if (updateError) return fail(500, "server_error", updateError.message);

    if (existing.anydesk_id !== payload.anydeskId) {
      anydeskChanged = { from: existing.anydesk_id, to: payload.anydeskId };
      await writeHistory(supabase, {
        deviceId: payload.deviceId,
        bayId: bay.id,
        previousAnydeskId: existing.anydesk_id,
        newAnydeskId: payload.anydeskId,
        changeSource
      });
    }
  }

  const warnings: RegisterSuccess["warnings"] = [];
  const { data: sameName } = await supabase
    .from("bay_pc_registry")
    .select("device_id")
    .eq("computer_name", payload.computerName)
    .neq("device_id", payload.deviceId);
  const duplicateIds = ((sameName ?? []) as Array<{ device_id: string }>).map((row) => row.device_id);
  if (duplicateIds.length > 0) {
    warnings.push({
      code: "computer_name_duplicate",
      message: `PC 이름 ${payload.computerName} 이(가) 다른 장비에도 쓰이고 있습니다.`,
      deviceIds: duplicateIds
    });
  }

  return {
    ok: true,
    result: {
      action,
      storeId: store.id,
      bayId: bay.id,
      bayCode: bay.bay_code,
      anydeskChanged,
      replacedDeviceId,
      warnings,
      deviceToken: issuedToken,
      registeredAt: nowIso
    }
  };
}

async function findStore(supabase: SupabaseClient, payload: RegisterPayload) {
  const query = supabase.from("stores").select("id, code");
  const { data } = payload.storeId
    ? await query.eq("id", payload.storeId).maybeSingle()
    : await query.eq("code", payload.storeCode as string).maybeSingle();
  return (data as { id: string; code: string } | null) ?? null;
}

async function findBay(supabase: SupabaseClient, storeId: string, payload: RegisterPayload) {
  const query = supabase.from("bays").select("id, bay_code").eq("store_id", storeId);
  const { data } = payload.bayId
    ? await query.eq("id", payload.bayId).maybeSingle()
    : await query.eq("bay_code", payload.bayCode as string).maybeSingle();
  return (data as { id: string; bay_code: string } | null) ?? null;
}

async function writeHistory(
  supabase: SupabaseClient,
  args: {
    deviceId: string;
    bayId: string;
    previousAnydeskId: string | null;
    newAnydeskId: string;
    changeSource: "setup_tool" | "admin" | "replace";
  }
) {
  // 이력 기록이 실패해도 등록 자체는 성립한다. 조용히 넘기되 본문은 로그에 남기지 않는다.
  const { error } = await supabase.from("bay_pc_anydesk_history").insert({
    device_id: args.deviceId,
    bay_id: args.bayId,
    previous_anydesk_id: args.previousAnydeskId,
    new_anydesk_id: args.newAnydeskId,
    change_source: args.changeSource
  });

  if (error) {
    console.warn("bay_pc_anydesk_history insert failed", { deviceIdPrefix: `${args.deviceId.slice(0, 8)}…` });
  }
}
