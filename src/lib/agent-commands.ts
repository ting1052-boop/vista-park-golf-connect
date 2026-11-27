import type { AgentDevice } from "@/lib/agent-server";
import type { createSupabaseAdminClient } from "@/lib/supabase/server";
import { planShutdownClaim, QUEUED_COMMAND_COLUMNS, type QueuedCommand } from "@/lib/command-maintenance";

const SHUTDOWN_COMMAND_MAX_AGE_MS = 300_000;

export async function claimShutdownCommand(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  agent: Pick<AgentDevice, "id" | "store_id" | "bay_id">
) {
  const now = new Date();
  const nowIso = now.toISOString();
  const activeCommandCutoff = new Date(now.getTime() - SHUTDOWN_COMMAND_MAX_AGE_MS).toISOString();
  const controllerId = `agent:${agent.id}`;

  // 대기열은 거의 비어 있다. 한 번 읽어 보고 정리할 것이 있을 때만 쓴다.
  const { data: rows, error: readError } = await supabase
    .from("store_controller_commands")
    .select(QUEUED_COMMAND_COLUMNS)
    .eq("store_id", agent.store_id)
    .eq("bay_id", agent.bay_id)
    .eq("command_type", "shutdown_pc")
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: true })
    .limit(100);
  if (readError) throw new Error(readError.message);
  if (!rows || rows.length === 0) return [];

  const plan = planShutdownClaim(rows as QueuedCommand[], now.getTime(), SHUTDOWN_COMMAND_MAX_AGE_MS);

  if (plan.recoverIds.length > 0) {
    const { error: leaseError } = await supabase
      .from("store_controller_commands")
      .update({ status: "pending", controller_id: null, lease_expires_at: null })
      .in("id", plan.recoverIds)
      .eq("status", "processing")
      .lt("lease_expires_at", nowIso);
    if (leaseError) throw new Error(leaseError.message);
  }

  if (plan.cancelIds.length > 0) {
    const { error: expiryError } = await supabase
      .from("store_controller_commands")
      .update({
        status: "cancelled",
        completed_at: nowIso,
        lease_expires_at: null,
        error_message: "Agent가 유효시간 안에 받지 못해 종료 명령을 폐기했습니다."
      })
      .in("id", plan.cancelIds)
      .eq("status", "pending")
      .lt("created_at", activeCommandCutoff);
    if (expiryError) throw new Error(expiryError.message);
  }

  const command = plan.next;
  if (!command) return [];

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
