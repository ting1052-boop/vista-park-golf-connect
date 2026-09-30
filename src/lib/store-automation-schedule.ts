import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueStoreClosure, enqueueStorePreparation } from "@/lib/store-controller";
import type { StoreAutomationGroup } from "@/lib/automation/device-map";

export type StoreAutomationSchedule = {
  enabled: boolean;
  openTime: string | null;
  closeTime: string | null;
  timezone: string;
  lastOpenedOn: string | null;
  lastClosedOn: string | null;
};

export type StoreAutomationSchedules = Record<StoreAutomationGroup, StoreAutomationSchedule>;

type ScheduleRow = {
  automation_schedule_enabled: boolean;
  automation_open_time: string | null;
  automation_close_time: string | null;
  automation_timezone: string | null;
  automation_last_opened_on: string | null;
  automation_last_closed_on: string | null;
  golf_schedule_enabled: boolean | null;
  golf_open_time: string | null;
  golf_close_time: string | null;
  golf_last_opened_on: string | null;
  golf_last_closed_on: string | null;
  park_schedule_enabled: boolean | null;
  park_open_time: string | null;
  park_close_time: string | null;
  park_last_opened_on: string | null;
  park_last_closed_on: string | null;
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
    .select("automation_timezone, golf_schedule_enabled, golf_open_time, golf_close_time, golf_last_opened_on, golf_last_closed_on, park_schedule_enabled, park_open_time, park_close_time, park_last_opened_on, park_last_closed_on")
    .eq("store_id", storeId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const row = data as ScheduleRow | null;
  const timezone = row?.automation_timezone ?? "Asia/Seoul";
  return {
    golf: {
      enabled: row?.golf_schedule_enabled ?? false,
      openTime: clock(row?.golf_open_time ?? null),
      closeTime: clock(row?.golf_close_time ?? null),
      timezone,
      lastOpenedOn: row?.golf_last_opened_on ?? null,
      lastClosedOn: row?.golf_last_closed_on ?? null
    },
    park: {
      enabled: row?.park_schedule_enabled ?? false,
      openTime: clock(row?.park_open_time ?? null),
      closeTime: clock(row?.park_close_time ?? null),
      timezone,
      lastOpenedOn: row?.park_last_opened_on ?? null,
      lastClosedOn: row?.park_last_closed_on ?? null
    }
  } satisfies StoreAutomationSchedules;
}

export async function processStoreAutomationSchedule(supabase: SupabaseClient, storeId: string, now: Date) {
  const schedules = await getStoreAutomationSchedule(supabase, storeId);
  for (const group of ["golf", "park"] as const) {
    const schedule = schedules[group];
    if (!schedule.enabled || !schedule.openTime || !schedule.closeTime) continue;
    const local = localDateAndTime(now, schedule.timezone);
    if (local.time >= schedule.closeTime && schedule.lastClosedOn !== local.date) {
      const result = await enqueueStoreClosure(supabase, storeId, "scheduled_store_close", { group });
      if (result.blocked) return { action: "close_blocked" as const, activeSessionCount: result.activeSessionCount, group };
      const { error } = await supabase
        .from("store_settings")
        .update({ [`${group}_last_closed_on`]: local.date })
        .eq("store_id", storeId);
      if (error) throw new Error(error.message);
      return { action: "closed" as const, group };
    }
    if (local.time >= schedule.openTime && local.time < schedule.closeTime && schedule.lastOpenedOn !== local.date) {
      await enqueueStorePreparation(supabase, storeId, "scheduled_store_open", group);
      const { error } = await supabase
        .from("store_settings")
        .update({ [`${group}_last_opened_on`]: local.date })
        .eq("store_id", storeId);
      if (error) throw new Error(error.message);
      return { action: "opened" as const, group };
    }
  }
  return { action: "none" as const };
}
