import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

export type AgentDevice = {
  id: string;
  store_id: string;
  bay_id: string;
  label: string;
  is_active: boolean;
  pc_name: string | null;
};

export type StoreExtensionSettings = {
  extension_mode: "auto" | "manual";
  extension_minutes: number;
  extension_notice_minutes: number;
  extension_deadline_minutes: number | null;
  extension_buffer_minutes: number;
  extension_price: number;
  conflict_policy: "reject" | "partial" | "manual_review";
};

export function hashAgentToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export async function getAgentByToken(
  supabase: SupabaseClient,
  request: NextRequest
): Promise<{ agent: AgentDevice | null; error: string | null }> {
  const token = getBearerToken(request);
  if (!token) {
    return { agent: null, error: "Agent 인증 토큰이 없습니다." };
  }

  const { data, error } = await supabase
    .from("agent_devices")
    .select("id, store_id, bay_id, label, is_active, pc_name")
    .eq("token_hash", hashAgentToken(token))
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    return { agent: null, error: error.message };
  }

  if (!data) {
    return { agent: null, error: "등록되지 않은 Agent 토큰입니다." };
  }

  return { agent: data as AgentDevice, error: null };
}

export async function touchAgent(
  supabase: SupabaseClient,
  agent: AgentDevice,
  args: { agentVersion?: string | null; pcName?: string | null } = {}
) {
  await supabase
    .from("agent_devices")
    .update({
      last_seen_at: new Date().toISOString(),
      agent_version: args.agentVersion ?? undefined,
      pc_name: args.pcName ?? agent.pc_name ?? undefined
    })
    .eq("id", agent.id);
}

export async function getStoreExtensionSettings(
  supabase: SupabaseClient,
  storeId: string
): Promise<StoreExtensionSettings> {
  const { data, error } = await supabase
    .from("store_settings")
    .select(
      "extension_mode, extension_minutes, extension_notice_minutes, extension_deadline_minutes, extension_buffer_minutes, extension_price, conflict_policy"
    )
    .eq("store_id", storeId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return {
    extension_mode: data?.extension_mode === "manual" ? "manual" : "auto",
    extension_minutes: Number(data?.extension_minutes ?? 30),
    extension_notice_minutes: Number(data?.extension_notice_minutes ?? 10),
    extension_deadline_minutes:
      data?.extension_deadline_minutes === null || data?.extension_deadline_minutes === undefined
        ? null
        : Number(data.extension_deadline_minutes),
    extension_buffer_minutes: Number(data?.extension_buffer_minutes ?? 10),
    extension_price: Number(data?.extension_price ?? 6000),
    conflict_policy:
      data?.conflict_policy === "reject" || data?.conflict_policy === "manual_review"
        ? data.conflict_policy
        : "partial"
  };
}

export function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}
