import type { GameTelemetry } from "@/lib/game-telemetry";

export type PcConnectionState = "connected" | "no_signal" | "shutdown_pending";
export type UsageState = "in_use" | "idle" | "unknown";
export type ShutdownRecord = {
  bay_id: string | null;
  status: string;
  created_at: string;
  completed_at: string | null;
};

export const pcConnectionLabels: Record<PcConnectionState, string> = {
  connected: "PC 연결됨",
  no_signal: "PC 신호 없음",
  shutdown_pending: "PC 종료 확인 중"
};
export const usageStateLabels: Record<UsageState, string> = {
  in_use: "이용 중",
  idle: "대기",
  unknown: "확인 불가"
};

export function getPcConnectionState(online: boolean, lastSeenAt: string | null | undefined, shutdown: ShutdownRecord | undefined, now: number): PcConnectionState {
  if (shutdown) {
    const requestedAt = Date.parse(shutdown.created_at);
    const completedAt = Date.parse(shutdown.completed_at ?? shutdown.created_at);
    const lastSeen = Date.parse(lastSeenAt ?? "");
    const pending = ["pending", "processing"].includes(shutdown.status) && now - requestedAt < 300_000;
    // An acknowledgement is not proof that Windows has powered off.
    const acknowledged = shutdown.status === "succeeded" && now - completedAt < 120_000 &&
      (!Number.isFinite(lastSeen) || lastSeen <= completedAt + 30_000);
    if (pending || acknowledged) return "shutdown_pending";
  }
  return online ? "connected" : "no_signal";
}

export function getUsageState(hasSession: boolean, online: boolean, telemetry: GameTelemetry | null | undefined, now: number, maxAgeMs = 45_000): UsageState {
  if (hasSession) return "in_use";
  const observedAt = Date.parse(telemetry?.observedAt ?? "");
  if (!online || !telemetry || !Number.isFinite(observedAt) || now - observedAt > maxAgeMs || observedAt > now + 5_000) return "unknown";
  const usage = telemetry.usage;
  if (usage?.state === "active" && Date.parse(usage.endsAt ?? "") > now) return "in_use";
  if (usage?.state === "awaiting_input" || telemetry.gameRunning === false) return "idle";
  return "unknown";
}
