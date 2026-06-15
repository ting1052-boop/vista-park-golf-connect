import type { SupabaseClient } from "@supabase/supabase-js";
import { commonAutomationScripts, getBayAutomationByCode, type AutomationAction } from "@/lib/automation/device-map";
import { runHomeAssistantScript } from "@/lib/automation/ha-client";

type AutomationStepResult = {
  name: string;
  script: string;
  ok: boolean;
  status: number;
  body: string;
  logError: string | null;
};

type BayRecord = {
  id: string;
  store_id: string;
  bay_code: string | null;
};

type RunBayAutomationArgs = {
  supabase: SupabaseClient;
  bayId: string;
  action: AutomationAction;
  accessSessionId?: string | null;
  reservationId?: string | null;
  requestedByUserId?: string | null;
};

const ACTIVE_SESSION_STATUSES = ["active", "extended"] as const;

async function getBay(supabase: SupabaseClient, bayId: string) {
  const { data, error } = await supabase.from("bays").select("id, store_id, bay_code").eq("id", bayId).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("타석을 찾을 수 없습니다.");
  }

  return data as BayRecord;
}

async function getActiveSessionCount(supabase: SupabaseClient, storeId: string) {
  const { count, error } = await supabase
    .from("access_sessions")
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId)
    .in("status", [...ACTIVE_SESSION_STATUSES]);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

async function insertAutomationLog(
  supabase: SupabaseClient,
  args: {
    storeId: string;
    accessSessionId?: string | null;
    reservationId?: string | null;
    requestedByUserId?: string | null;
    eventName: string;
    command: string;
    status: "success" | "failed";
    requestPayload: Record<string, unknown>;
    responsePayload: Record<string, unknown>;
    errorMessage?: string | null;
  }
) {
  const { error } = await supabase.from("automation_logs").insert({
    store_id: args.storeId,
    access_session_id: args.accessSessionId ?? null,
    reservation_id: args.reservationId ?? null,
    requested_by_user_id: args.requestedByUserId ?? null,
    event_name: args.eventName,
    command: args.command,
    status: args.status,
    request_payload: args.requestPayload,
    response_payload: args.responsePayload,
    error_message: args.errorMessage ?? null
  });

  return error?.message ?? null;
}

async function runStep(
  supabase: SupabaseClient,
  args: RunBayAutomationArgs & {
    storeId: string;
    name: string;
    script: string;
    variables: Record<string, unknown>;
  }
): Promise<AutomationStepResult> {
  try {
    const result = await runHomeAssistantScript(args.script, args.variables);
    const logError = await insertAutomationLog(args.supabase, {
      storeId: args.storeId,
      accessSessionId: args.accessSessionId,
      reservationId: args.reservationId,
      requestedByUserId: args.requestedByUserId,
      eventName: args.name,
      command: args.script,
      status: result.ok ? "success" : "failed",
      requestPayload: args.variables,
      responsePayload: result,
      errorMessage: result.ok ? null : `Home Assistant 응답 실패: ${result.status}`
    });

    return {
      name: args.name,
      script: args.script,
      ok: result.ok,
      status: result.status,
      body: result.body,
      logError
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "알 수 없는 자동화 오류";
    const logError = await insertAutomationLog(args.supabase, {
      storeId: args.storeId,
      accessSessionId: args.accessSessionId,
      reservationId: args.reservationId,
      requestedByUserId: args.requestedByUserId,
      eventName: args.name,
      command: args.script,
      status: "failed",
      requestPayload: args.variables,
      responsePayload: { ok: false, error: errorMessage },
      errorMessage
    });

    return {
      name: args.name,
      script: args.script,
      ok: false,
      status: 500,
      body: errorMessage,
      logError
    };
  }
}

export async function runBayAutomation(args: RunBayAutomationArgs) {
  const bay = await getBay(args.supabase, args.bayId);
  const bayAutomation = getBayAutomationByCode(bay.bay_code);

  if (!bayAutomation) {
    throw new Error(`자동화 매핑이 없는 타석입니다: ${bay.bay_code ?? args.bayId}`);
  }

  // Caller must update and commit access_sessions first:
  // enter -> active session exists, exit -> completed/cancelled session is no longer active.
  const activeSessionCount = await getActiveSessionCount(args.supabase, bay.store_id);
  const shouldRunCommonOn = args.action === "enter" && activeSessionCount <= 1;
  const shouldRunCommonOff = args.action === "exit" && activeSessionCount === 0;
  const variables = {
    bayId: bay.id,
    bayCode: bay.bay_code,
    bayLabel: bayAutomation.label,
    action: args.action,
    activeSessionCount
  };
  const steps: AutomationStepResult[] = [];

  if (shouldRunCommonOn) {
    steps.push(
      await runStep(args.supabase, {
        ...args,
        storeId: bay.store_id,
        name: "공용 장비 ON",
        script: commonAutomationScripts.on,
        variables
      })
    );
  }

  steps.push(
    await runStep(args.supabase, {
      ...args,
      storeId: bay.store_id,
      name: args.action === "enter" ? `${bayAutomation.label} 입장 준비` : `${bayAutomation.label} 이용 종료`,
      script: args.action === "enter" ? bayAutomation.enterScript : bayAutomation.exitScript,
      variables
    })
  );

  if (shouldRunCommonOff) {
    steps.push(
      await runStep(args.supabase, {
        ...args,
        storeId: bay.store_id,
        name: "공용 장비 OFF",
        script: commonAutomationScripts.off,
        variables
      })
    );
  }

  return {
    bay,
    bayAutomation,
    activeSessionCount,
    commonAction: {
      on: shouldRunCommonOn,
      off: shouldRunCommonOff
    },
    steps
  };
}
