import type { AgentDevice } from "@/lib/agent-server";
import { SONGDO_STORE_ID } from "@/lib/automation/device-map";

export function getAgentObserverPolicy(agent: Pick<AgentDevice, "store_id">, protocol: unknown) {
  return agent.store_id === SONGDO_STORE_ID && protocol === 1
    ? { protocol: 1 as const, pollIntervalSeconds: 60 }
    : null;
}
