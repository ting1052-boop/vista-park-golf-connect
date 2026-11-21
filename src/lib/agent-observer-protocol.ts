import type { AgentDevice } from "@/lib/agent-server";
import { SONGDO_STORE_ID } from "@/lib/automation/device-map";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function getAgentObserverPolicy(
  supabase: SupabaseClient,
  agent: Pick<AgentDevice, "store_id" | "bay_id">,
  protocol: unknown
) {
  if (protocol !== 1) return null;
  if (agent.store_id === SONGDO_STORE_ID) return { protocol: 1 as const, pollIntervalSeconds: 60 };

  const [store, pc] = await Promise.all([
    supabase.from("stores").select("agent_monitor_only, agent_round_counting").eq("id", agent.store_id).maybeSingle(),
    supabase.from("bay_pc_registry").select("pc_type").eq("store_id", agent.store_id).eq("bay_id", agent.bay_id).maybeSingle()
  ]);
  return !store.error && !pc.error && store.data?.agent_monitor_only === true &&
    store.data?.agent_round_counting === true && pc.data?.pc_type === "park"
    ? { protocol: 1 as const, pollIntervalSeconds: 60 }
    : null;
}
