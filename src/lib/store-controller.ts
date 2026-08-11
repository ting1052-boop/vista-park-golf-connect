import type { SupabaseClient } from "@supabase/supabase-js";
import { commonAutomationScripts, getBayAutomationByCode } from "@/lib/automation/device-map";

export type StoreControllerCommandStatus = "pending" | "processing" | "succeeded" | "failed" | "cancelled";

export type StoreControllerScript = {
  name: string;
  script: string;
};

export type StoreControllerCommandPayload = {
  scripts: StoreControllerScript[];
  variables: Record<string, unknown>;
};

type BayForController = {
  id: string;
  store_id: string;
  bay_code: string | null;
};

export function isStoreControllerEnabled() {
  return process.env.STORE_CONTROLLER_ENABLED === "true";
}

export async function enqueueBayPreparation(
  supabase: SupabaseClient,
  args: { bayId: string; accessSessionId: string; reservationId?: string | null }
) {
  const { data: bayData, error: bayError } = await supabase
    .from("bays")
    .select("id, store_id, bay_code")
    .eq("id", args.bayId)
    .maybeSingle();

  if (bayError) throw new Error(bayError.message);
  if (!bayData) throw new Error("타석 정보를 찾을 수 없습니다.");

  const bay = bayData as BayForController;
  const mapping = getBayAutomationByCode(bay.bay_code);
  if (!mapping) throw new Error("이 타석의 장비 제어 연결 정보가 없습니다.");

  const { count, error: countError } = await supabase
    .from("access_sessions")
    .select("id", { count: "exact", head: true })
    .eq("store_id", bay.store_id)
    .in("status", ["active", "extended"]);

  if (countError) throw new Error(countError.message);

  const variables = {
    bayId: bay.id,
    bayCode: bay.bay_code,
    bayLabel: mapping.label,
    action: "enter",
    accessSessionId: args.accessSessionId,
    reservationId: args.reservationId ?? null,
    activeSessionCount: count ?? 0
  };
  const scripts: StoreControllerScript[] = [];

  if ((count ?? 0) <= 1) {
    scripts.push({ name: "공용 장비 준비", script: commonAutomationScripts.on });
  }
  scripts.push({ name: `${mapping.label} 준비`, script: mapping.enterScript });

  const payload: StoreControllerCommandPayload = { scripts, variables };
  const { data, error } = await supabase
    .from("store_controller_commands")
    .insert({
      store_id: bay.store_id,
      bay_id: bay.id,
      access_session_id: args.accessSessionId,
      reservation_id: args.reservationId ?? null,
      command_type: "prepare_bay",
      payload
    })
    .select("id, status")
    .single();

  if (!error && data) {
    return { id: data.id as string, status: data.status as StoreControllerCommandStatus, reused: false };
  }
  if (error?.code !== "23505") throw new Error(error?.message ?? "장비 준비 명령을 저장하지 못했습니다.");

  const { data: existing, error: existingError } = await supabase
    .from("store_controller_commands")
    .select("id, status")
    .eq("access_session_id", args.accessSessionId)
    .eq("command_type", "prepare_bay")
    .maybeSingle();

  if (existingError || !existing) {
    throw new Error(existingError?.message ?? "기존 장비 준비 명령을 찾지 못했습니다.");
  }

  return { id: existing.id as string, status: existing.status as StoreControllerCommandStatus, reused: true };
}
