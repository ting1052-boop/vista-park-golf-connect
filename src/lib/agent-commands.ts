import type { AgentDevice } from "@/lib/agent-server";
import type { createSupabaseAdminClient } from "@/lib/supabase/server";

type AgentCommandRow = {
  id: string;
  command_type: "shutdown_pc";
  payload: Record<string, unknown> | null;
  attempts: number;
};

export async function claimShutdownCommand(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  agent: Pick<AgentDevice, "id" | "store_id" | "bay_id">
) {
  const now = new Date();
  const nowIso = now.toISOString();
  const activeCommandCutoff = new Date(now.getTime() - 300_000).toISOString();
  const controllerId = `agent:${agent.id}`;

  const { error: leaseError } = await supabase
    .from("store_controller_commands")
    .update({ status: "pending", controller_id: null, lease_expires_at: null })
    .eq("store_id", agent.store_id)
    .eq("bay_id", agent.bay_id)
    .eq("command_type", "shutdown_pc")
    .eq("status", "processing")
    .lt("lease_expires_at", nowIso);
  if (leaseError) throw new Error(leaseError.message);

  const { error: expiryError } = await supabase
    .from("store_controller_commands")
    .update({
      status: "cancelled",
      completed_at: nowIso,
      lease_expires_at: null,
      error_message: "Agent가 유효시간 안에 받지 못해 종료 명령을 폐기했습니다."
    })
    .eq("store_id", agent.store_id)
    .eq("bay_id", agent.bay_id)
    .eq("command_type", "shutdown_pc")
    .eq("status", "pending")
    .lt("created_at", activeCommandCutoff);
  if (expiryError) throw new Error(expiryError.message);

  const { data: pending, error: pendingError } = await supabase
    .from("store_controller_commands")
    .select("id, command_type, payload, attempts")
    .eq("store_id", agent.store_id)
    .eq("bay_id", agent.bay_id)
    .eq("command_type", "shutdown_pc")
    .eq("status", "pending")
    .gte("created_at", activeCommandCutoff)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (pendingError) throw new Error(pendingError.message);
  if (!pending) return [];

  const command = pending as AgentCommandRow;
  const { data: claimed, error: claimError } = await supabase
    .from("store_controller_commands")
    .update({
      status: "processing",
      controller_id: controllerId,
      lease_expires_at: new Date(now.getTime() + 120_000).toISOString(),
      attempts: command.attempts + 1
    })
    .eq("store_id", agent.store_id)
    .eq("bay_id", agent.bay_id)
    .eq("command_type", "shutdown_pc")
    .eq("id", command.id)
    .eq("status", "pending")
    .select("id, command_type, payload")
    .maybeSingle();

  if (claimError) throw new Error(claimError.message);
  if (!claimed) return [];

  return [{ id: claimed.id as string, type: "shutdown_pc" as const, payload: claimed.payload ?? {} }];
}
