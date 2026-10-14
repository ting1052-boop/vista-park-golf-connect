import { SONGDO_STORE_ID } from "@/lib/automation/device-map";

export function getStoreObservationPolicy(storeId: string) {
  const observer = storeId === SONGDO_STORE_ID;
  return {
    refreshIntervalMs: observer ? 60_000 : 15_000,
    pcSignalMaxAgeMs: observer ? 180_000 : 120_000,
    telemetryMaxAgeMs: observer ? 150_000 : 45_000
  };
}
