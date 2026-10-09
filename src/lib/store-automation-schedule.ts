import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueStoreClosure, enqueueStorePreparation } from "@/lib/store-controller";
import type { AutomationSchedule, AutomationScheduleConfig } from "@/lib/automation/schedule-config";
import { SONGDO_STORE_ID, getStoreAutomationGroup } from "@/lib/automation/device-map";

const timeFormatters = new Map<string, Intl.DateTimeFormat>();

function localDateAndTime(now: Date, timeZone: string) {
  let formatter = timeFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    timeFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

function legacySchedule(row: Record<string, unknown>, prefix: string, id: string, name: string, bayIds: string[] | null, closeBayIds = bayIds): AutomationSchedule {
  return {
    id, name, bayIds, closeBayIds,
    enabled: row[`${prefix}_schedule_enabled`] === true,
    openTime: typeof row[`${prefix}_open_time`] === "string" ? String(row[`${prefix}_open_time`]).slice(0, 5) : null,
    closeTime: typeof row[`${prefix}_close_time`] === "string" ? String(row[`${prefix}_close_time`]).slice(0, 5) : null,
    lastOpenedOn: typeof row[`${prefix}_last_opened_on`] === "string" ? row[`${prefix}_last_opened_on`] as string : null,
    lastClosedOn: typeof row[`${prefix}_last_closed_on`] === "string" ? row[`${prefix}_last_closed_on`] as string : null
  };
}

export async function getStoreAutomationSchedule(supabase: SupabaseClient, storeId: string) {
  const { data, error } = await supabase.from("store_settings").select("*").eq("store_id", storeId).maybeSingle();
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  const timezone = typeof row.automation_timezone === "string" ? row.automation_timezone : "Asia/Seoul";
  if (row.automation_schedule_config && typeof row.automation_schedule_config === "object") {
    return { config: row.automation_schedule_config as AutomationScheduleConfig, custom: true, timezone };
  }
  if (storeId === SONGDO_STORE_ID) {
    const bays = await supabase.from("bays").select("id, bay_code").eq("store_id", storeId);
    if (bays.error) throw new Error(bays.error.message);
    const byGroup = (group: "golf" | "park") => (bays.data ?? []).filter((bay) => getStoreAutomationGroup(bay.bay_code) === group).map((bay) => bay.id);
    const golfCloseBayIds = (bays.data ?? []).filter((bay) => getStoreAutomationGroup(bay.bay_code) === "golf" || bay.bay_code?.trim().toUpperCase() === "A-07").map((bay) => bay.id);
    return { config: { mode: "zones", schedules: [legacySchedule(row, "golf", "golf", "골프 타석", byGroup("golf"), golfCloseBayIds), legacySchedule(row, "park", "park", "파크골프", byGroup("park"))] }, custom: false, timezone };
  }
  return { config: { mode: "store", schedules: [legacySchedule(row, "automation", "store", "매장 전체", null)] }, custom: false, timezone };
}

export async function processStoreAutomationSchedule(supabase: SupabaseClient, storeId: string, now: Date) {
  const { config, custom, timezone } = await getStoreAutomationSchedule(supabase, storeId);
  const local = localDateAndTime(now, timezone);
  const actions: Array<{ id: string; action: string }> = [];
  for (const schedule of config.schedules) {
    if (!schedule.enabled || !schedule.openTime || !schedule.closeTime) continue;
    const openGroup = config.mode === "zones" ? schedule.bayIds ?? [] : undefined;
    const closeGroup = config.mode === "zones" ? schedule.closeBayIds ?? schedule.bayIds ?? [] : undefined;
    if (openGroup && openGroup.length === 0) continue;
    let action: "opened" | "closed" | null = null;
    if (local.time >= schedule.closeTime && schedule.lastClosedOn !== local.date) {
      const result = await enqueueStoreClosure(supabase, storeId, `scheduled_close:${schedule.id}`, { group: closeGroup });
      if (result.blocked || (!result.command && result.agentShutdown.queued + result.agentShutdown.reused === 0)) continue;
      action = "closed";
    } else if (local.time >= schedule.openTime && local.time < schedule.closeTime && schedule.lastOpenedOn !== local.date) {
      const result = await enqueueStorePreparation(supabase, storeId, `scheduled_open:${schedule.id}`, openGroup);
      if (!result.command) continue;
      action = "opened";
    }
    if (!action) continue;
    const key = action === "opened" ? "lastOpenedOn" : "lastClosedOn";
    schedule[key] = local.date;
    if (custom) {
      const { error } = await supabase.from("store_settings").update({ automation_schedule_config: config }).eq("store_id", storeId);
      if (error) throw new Error(error.message);
    } else {
      const prefix = config.mode === "store" ? "automation" : schedule.id;
      const { error } = await supabase.from("store_settings").update({ [`${prefix}_${action === "opened" ? "last_opened_on" : "last_closed_on"}`]: local.date }).eq("store_id", storeId);
      if (error) throw new Error(error.message);
    }
    actions.push({ id: schedule.id, action });
  }
  return { actions };
}
