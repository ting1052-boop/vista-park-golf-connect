import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueStoreClosure, enqueueStorePreparation } from "@/lib/store-controller";

export type StoreAutomationSchedule = {
  enabled: boolean;
  openTime: string | null;
  closeTime: string | null;
  timezone: string;
  lastOpenedOn: string | null;
  lastClosedOn: string | null;
};

type ScheduleRow = {
  automation_schedule_enabled: boolean;
  automation_open_time: string | null;
  automation_close_time: string | null;
  automation_timezone: string | null;
  automation_last_opened_on: string | null;
  automation_last_closed_on: string | null;
};

function clock(value: string | null) {
  return value ? value.slice(0, 5) : null;
}

function localDateAndTime(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

export async function getStoreAutomationSchedule(supabase: SupabaseClient, storeId: string) {
  const { data, error } = await supabase
    .from("store_settings")
    .select("automation_schedule_enabled, automation_open_time, automation_close_time, automation_timezone, automation_last_opened_on, automation_last_closed_on")
    .eq("store_id", storeId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const row = data as ScheduleRow | null;
  return {
    enabled: row?.automation_schedule_enabled ?? false,
    openTime: clock(row?.automation_open_time ?? null),
    closeTime: clock(row?.automation_close_time ?? null),
    timezone: row?.automation_timezone ?? "Asia/Seoul",
    lastOpenedOn: row?.automation_last_opened_on ?? null,
    lastClosedOn: row?.automation_last_closed_on ?? null
  } satisfies StoreAutomationSchedule;
}

export async function processStoreAutomationSchedule(supabase: SupabaseClient, storeId: string, now: Date) {
  const schedule = await getStoreAutomationSchedule(supabase, storeId);
  if (!schedule.enabled || !schedule.openTime || !schedule.closeTime) return { action: "none" as const };

  const local = localDateAndTime(now, schedule.timezone);
  if (local.time >= schedule.closeTime && schedule.lastClosedOn !== local.date) {
    const result = await enqueueStoreClosure(supabase, storeId, "scheduled_store_close");
    if (result.blocked) return { action: "close_blocked" as const, activeSessionCount: result.activeSessionCount };
    const { error } = await supabase
      .from("store_settings")
      .update({ automation_last_closed_on: local.date })
      .eq("store_id", storeId);
    if (error) throw new Error(error.message);
    return { action: "closed" as const };
  }

  if (local.time >= schedule.openTime && local.time < schedule.closeTime && schedule.lastOpenedOn !== local.date) {
    await enqueueStorePreparation(supabase, storeId, "scheduled_store_open");
    const { error } = await supabase
      .from("store_settings")
      .update({ automation_last_opened_on: local.date })
      .eq("store_id", storeId);
    if (error) throw new Error(error.message);
    return { action: "opened" as const };
  }

  return { action: "none" as const };
}
