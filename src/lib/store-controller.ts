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

type AgentForShutdown = {
  bay_id: string | null;
  last_seen_at: string | null;
};

const AGENT_ONLINE_THRESHOLD_MS = 120_000;
const SHUTDOWN_COMMAND_MAX_AGE_MS = 300_000;

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

async function enqueueScripts(
  supabase: SupabaseClient,
  args: {
    storeId: string;
    bayId?: string | null;
    accessSessionId?: string | null;
    reservationId?: string | null;
    commandType: "release_bay" | "run_scripts";
    scripts: StoreControllerScript[];
    variables: Record<string, unknown>;
  }
) {
  const { data, error } = await supabase
    .from("store_controller_commands")
    .insert({
      store_id: args.storeId,
      bay_id: args.bayId ?? null,
      access_session_id: args.accessSessionId ?? null,
      reservation_id: args.reservationId ?? null,
      command_type: args.commandType,
      payload: { scripts: args.scripts, variables: args.variables } satisfies StoreControllerCommandPayload
    })
    .select("id, status")
    .single();

  if (error) throw new Error(error.message);

  return { id: data.id as string, status: data.status as StoreControllerCommandStatus };
}

export async function enqueueBayRelease(
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

  const scripts: StoreControllerScript[] = [{ name: `${mapping.label} 이용 종료`, script: mapping.exitScript }];
  if ((count ?? 0) === 0) {
    scripts.push({ name: "공용 장비 OFF", script: commonAutomationScripts.off });
  }

  return enqueueScripts(supabase, {
    storeId: bay.store_id,
    bayId: bay.id,
    accessSessionId: args.accessSessionId,
    reservationId: args.reservationId ?? null,
    commandType: "release_bay",
    scripts,
    variables: {
      bayId: bay.id,
      bayCode: bay.bay_code,
      bayLabel: mapping.label,
      action: "exit",
      accessSessionId: args.accessSessionId,
      reservationId: args.reservationId ?? null,
      activeSessionCount: count ?? 0
    }
  });
}

export async function enqueueManualAutomation(
  supabase: SupabaseClient,
  args: { storeId: string; scripts: StoreControllerScript[]; action: string }
) {
  return enqueueScripts(supabase, {
    storeId: args.storeId,
    commandType: "run_scripts",
    scripts: args.scripts,
    variables: { action: args.action, requestedFrom: "admin_automation" }
  });
}

export async function enqueueStoreAgentShutdowns(supabase: SupabaseClient, storeId: string) {
  const { data: agents, error: agentsError } = await supabase
    .from("agent_devices")
    .select("bay_id, last_seen_at")
    .eq("store_id", storeId)
    .eq("is_active", true)
    .not("bay_id", "is", null);

  if (agentsError) throw new Error(agentsError.message);

  const bayIds = Array.from(
    new Set(
      ((agents ?? []) as AgentForShutdown[])
        .filter((agent) => {
          const lastSeenMs = agent.last_seen_at ? new Date(agent.last_seen_at).getTime() : 0;
          return lastSeenMs > 0 && Date.now() - lastSeenMs <= AGENT_ONLINE_THRESHOLD_MS;
        })
        .map((agent) => agent.bay_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  if (bayIds.length === 0) return { queued: 0, reused: 0 };

  const activeCommandCutoff = new Date(Date.now() - SHUTDOWN_COMMAND_MAX_AGE_MS).toISOString();
  const { data: existing, error: existingError } = await supabase
    .from("store_controller_commands")
    .select("bay_id")
    .eq("store_id", storeId)
    .eq("command_type", "shutdown_pc")
    .in("status", ["pending", "processing"])
    .gte("created_at", activeCommandCutoff)
    .in("bay_id", bayIds);

  if (existingError) throw new Error(existingError.message);

  const existingBayIds = new Set(
    ((existing ?? []) as AgentForShutdown[]).map((row) => row.bay_id).filter((id): id is string => Boolean(id))
  );
  const newBayIds = bayIds.filter((bayId) => !existingBayIds.has(bayId));

  if (newBayIds.length > 0) {
    const { error: insertError } = await supabase.from("store_controller_commands").insert(
      newBayIds.map((bayId) => ({
        store_id: storeId,
        bay_id: bayId,
        command_type: "shutdown_pc",
        payload: {
          scripts: [],
          variables: { action: "shutdown_pc", requestedFrom: "admin_store_close" }
        } satisfies StoreControllerCommandPayload
      }))
    );

    if (insertError) throw new Error(insertError.message);
  }

  return { queued: newBayIds.length, reused: existingBayIds.size };
}
