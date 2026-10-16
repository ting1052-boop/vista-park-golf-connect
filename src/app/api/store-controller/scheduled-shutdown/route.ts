import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { readBearerToken, resolveControllerAuth } from "@/lib/store-controller-auth";
import { SONGDO_STORE_ID } from "@/lib/automation/device-map";
import { getStoreAutomationSchedule } from "@/lib/store-automation-schedule";
import { enqueueStoreClosure } from "@/lib/store-controller";

const reply = (status: number, message: string) => NextResponse.json({ ok: false, message }, { status });

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();
    const auth = await resolveControllerAuth({
      received: readBearerToken(request.headers.get("authorization")),
      globalToken: undefined,
      headerStoreId: SONGDO_STORE_ID,
      lookupStoreByTokenHash: async (hash) => {
        const { data, error } = await supabase.from("store_controller_tokens")
          .select("store_id").eq("token_hash", hash).eq("is_active", true).maybeSingle();
        return error || !data ? null : data.store_id;
      }
    });
    if (!auth.ok) return reply(401, "Authentication required.");
    if (!auth.scoped || auth.storeId !== SONGDO_STORE_ID) return reply(403, "Store not allowed.");

    const headerStore = request.headers.get("x-store-id");
    if (headerStore !== null && headerStore !== SONGDO_STORE_ID) return reply(403, "Store mismatch.");
    let body;
    try { body = await request.json(); } catch { return reply(400, "Invalid request."); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return reply(400, "Invalid request.");
    if (body.storeId !== undefined && body.storeId !== SONGDO_STORE_ID) return reply(403, "Store mismatch.");
    if ((body.group !== "golf" && body.group !== "park") ||
        (body.dryRun !== undefined && typeof body.dryRun !== "boolean") ||
        Object.keys(body).some((key) => !["group", "dryRun", "storeId"].includes(key))) {
      return reply(400, "Invalid request.");
    }

    const { config, custom, timezone } = await getStoreAutomationSchedule(supabase, SONGDO_STORE_ID);
    if (!custom || config.mode !== "zones" || timezone !== "Asia/Seoul" || !Array.isArray(config.schedules)) {
      return reply(400, "Unsupported schedule configuration.");
    }
    const schedules = config.schedules.filter((row) => row.id === body.group);
    const schedule = schedules[0];
    if (schedules.length !== 1 || !schedule || typeof schedule.closeTime !== "string" ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.closeTime)) {
      return reply(400, "Invalid closing schedule.");
    }

    const { data: bays, error: bayError } = await supabase.from("bays")
      .select("id, bay_code").eq("store_id", SONGDO_STORE_ID);
    if (bayError) return reply(503, "Targets unavailable.");
    const codes = body.group === "golf"
      ? ["A01", "A02", "A03", "A04", "A05", "A06", "A07"] : ["P01", "P02"];
    const targets = (bays ?? []).filter((bay) => typeof bay.bay_code === "string" &&
      codes.includes(bay.bay_code.trim().toUpperCase().replace(/-/g, "")));
    const foundCodes = new Set(targets.map((bay) => bay.bay_code.trim().toUpperCase().replace(/-/g, "")));
    if (targets.length !== codes.length || foundCodes.size !== codes.length ||
        targets.some((bay) => typeof bay.id !== "string" || !bay.id) ||
        new Set(targets.map((bay) => bay.id)).size !== codes.length) {
      return reply(400, "Incomplete or ambiguous targets.");
    }
    const bayIds = targets.map((bay) => bay.id as string);
    if (body.dryRun === true) {
      return NextResponse.json({ ok: true, dryRun: true, group: body.group, bayIds,
        closeTime: schedule.closeTime, timezone });
    }

    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric",
      month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
      hourCycle: "h23" }).formatToParts(new Date());
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((row) => row.type === type)!.value;
    const date = `${part("year")}-${part("month")}-${part("day")}`;
    const [hour, minute] = schedule.closeTime.split(":").map(Number);
    const elapsed = Number(part("hour")) * 3600 + Number(part("minute")) * 60 + Number(part("second")) -
      (hour * 3600 + minute * 60);
    if (elapsed < 0 || elapsed > 600) return reply(403, "Outside scheduled closing window.");
    if (schedule.lastClosedOn === date) {
      return NextResponse.json({ ok: true, alreadyClosed: true, group: body.group, date });
    }

    const result = await enqueueStoreClosure(supabase, SONGDO_STORE_ID, `ha_scheduled_close:${body.group}`,
      { includeEquipment: false, group: bayIds });
    if (result.blocked) return reply(409, "Active sessions prevent shutdown.");
    const { queued, reused } = result.agentShutdown;
    if (queued + reused === 0) return reply(503, "No eligible Agents. Retry within closing window.");

    // Compare the original config so a concurrent settings save is never overwritten.
    const nextConfig = { ...config, schedules: config.schedules.map((row) =>
      row.id === body.group ? { ...row, lastClosedOn: date } : row) };
    const { data: saved, error: saveError } = await supabase.from("store_settings")
      .update({ automation_schedule_config: nextConfig }).eq("store_id", SONGDO_STORE_ID)
      .eq("automation_schedule_config", JSON.stringify(config)).select("store_id").maybeSingle();
    if (saveError || !saved) return reply(503, "Shutdown queued; completion marker unavailable. Retry within closing window.");
    return NextResponse.json({ ok: true, group: body.group, date, queued, reused });
  } catch {
    return reply(503, "Scheduled shutdown unavailable.");
  }
}
