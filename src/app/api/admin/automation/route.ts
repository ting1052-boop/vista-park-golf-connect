import { NextRequest, NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin-context";
import {
  commonAutomationScripts,
  getBayAutomationByCode
} from "@/lib/automation/device-map";
import {
  enqueueBayAgentShutdown,
  enqueueManualAutomation,
  enqueueStoreClosure,
  enqueueStorePreparation,
  isStoreControllerEnabled
} from "@/lib/store-controller";
import { getStoreAutomationSchedule } from "@/lib/store-automation-schedule";
import { closeExpiredSessions } from "@/lib/session-cleanup";
import { getLatestScriptRuns, getPowerState } from "@/lib/supabase/automation-status";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type ActiveSessionRow = {
  id: string;
  bay_id: string | null;
  guest_name: string | null;
  started_at: string | null;
  ends_at: string | null;
  status: string;
  bays: { bay_code: string | null; display_name: string | null } | Array<{ bay_code: string | null; display_name: string | null }> | null;
};

type ControllerLogRow = {
  id: string;
  created_at: string;
  command_type: string;
  status: string;
  error_message: string | null;
  payload: { scripts?: Array<{ name?: string; script?: string }> } | null;
};
type ControllerQueueRow = { created_at: string; status: string };

type BayRow = { id: string; bay_code: string; display_name: string | null };
type AgentRow = {
  bay_id: string | null;
  pc_name: string | null;
  is_active: boolean | null;
  last_seen_at: string | null;
};

const AGENT_ONLINE_THRESHOLD_MS = 120_000;
const CONTROLLER_STALLED_THRESHOLD_MS = 30_000;

const commandTypeLabels: Record<string, string> = {
  prepare_bay: "타석 준비",
  release_bay: "타석 이용 종료",
  run_scripts: "관리자 장비 제어",
  shutdown_pc: "타석 PC 정상 종료"
};

function getBay(row: ActiveSessionRow) {
  return Array.isArray(row.bays) ? row.bays[0] : row.bays;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul"
  }).format(new Date(value));
}

async function requireContext() {
  try {
    return { context: await getAdminContext(), denied: null };
  } catch {
    return {
      context: null,
      denied: NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 })
    };
  }
}

export async function GET() {
  const { context, denied } = await requireContext();
  if (denied) return denied;
  const storeId = context!.storeId;

  try {
    const supabase = createSupabaseAdminClient();
    const [sessionsResult, logsResult, queueResult, baysResult, agentsResult] = await Promise.all([
      supabase
        .from("access_sessions")
        .select("id, bay_id, guest_name, started_at, ends_at, status, bays(bay_code, display_name)")
        .eq("store_id", storeId)
        .in("status", ["active", "extended", "overdue"])
        .order("started_at", { ascending: false }),
      supabase
        .from("store_controller_commands")
        .select("id, created_at, command_type, status, error_message, payload")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("store_controller_commands")
        .select("created_at, status")
        .eq("store_id", storeId)
        .in("status", ["pending", "processing"])
        .in("command_type", ["prepare_bay", "release_bay", "run_scripts"])
        .order("created_at", { ascending: true })
        .limit(100),
      supabase
        .from("bays")
        .select("id, bay_code, display_name")
        .eq("store_id", storeId)
        .order("bay_code", { ascending: true }),
      supabase
        .from("agent_devices")
        .select("bay_id, pc_name, is_active, last_seen_at")
        .eq("store_id", storeId)
    ]);

    if (sessionsResult.error) throw new Error(sessionsResult.error.message);
    if (logsResult.error) throw new Error(logsResult.error.message);
    if (queueResult.error) throw new Error(queueResult.error.message);
    if (baysResult.error) throw new Error(baysResult.error.message);
    if (agentsResult.error) throw new Error(agentsResult.error.message);

    const now = Date.now();
    const sessions = ((sessionsResult.data ?? []) as ActiveSessionRow[]).map((row) => {
      const endsAt = row.ends_at ? new Date(row.ends_at).getTime() : null;
      const remainingMinutes = endsAt === null ? null : Math.ceil((endsAt - now) / 60_000);
      const bay = getBay(row);
      return {
        id: row.id,
        bay: bay?.bay_code ?? bay?.display_name ?? "미배정",
        customer: row.guest_name ?? "현장 고객",
        startedAt: row.started_at ? formatTime(row.started_at) : "-",
        endsAt: row.ends_at ? formatTime(row.ends_at) : "-",
        remainingMinutes,
        expired: remainingMinutes !== null && remainingMinutes <= 0,
        status: row.status
      };
    });

    const logs = ((logsResult.data ?? []) as ControllerLogRow[]).map((row) => {
      const scriptNames = row.payload?.scripts
        ?.map((script) => script.name ?? script.script)
        .filter((name): name is string => Boolean(name));

      return {
        id: row.id,
        time: formatTime(row.created_at),
        title: commandTypeLabels[row.command_type] ?? row.command_type,
        detail: row.error_message ?? scriptNames?.join(", ") ?? "제어 명령 처리",
        status: row.status
      };
    });

    const stalePendingLogs = ((queueResult.data ?? []) as ControllerQueueRow[]).filter(
      (row) => row.status === "pending" && now - new Date(row.created_at).getTime() > CONTROLLER_STALLED_THRESHOLD_MS
    );
    const staleProcessingLogs = ((queueResult.data ?? []) as ControllerQueueRow[]).filter(
      (row) => row.status === "processing" && now - new Date(row.created_at).getTime() > CONTROLLER_STALLED_THRESHOLD_MS
    );
    const staleControllerCommands = [...stalePendingLogs, ...staleProcessingLogs];
    const controllerEnabled = isStoreControllerEnabled();
    const controllerStalled = controllerEnabled && staleControllerCommands.length > 0;

    const agentsByBayId = new Map<string, AgentRow>();
    for (const agent of (agentsResult.data ?? []) as AgentRow[]) {
      if (!agent.bay_id) continue;
      const previous = agentsByBayId.get(agent.bay_id);
      if (!previous || new Date(agent.last_seen_at ?? 0).getTime() > new Date(previous.last_seen_at ?? 0).getTime()) {
        agentsByBayId.set(agent.bay_id, agent);
      }
    }

    // 타석별 마지막 장비 명령(제어기 실행 기록 기준)과 이용 중 여부.
    // 실제 PC 연결은 Agent 신호로 별도 표시하고, 이용 중인 타석을 실수로 끄지 않도록 쓰인다.
    const latestRuns = await getLatestScriptRuns(supabase, storeId);
    const activeBayIds = new Set(
      ((sessionsResult.data ?? []) as ActiveSessionRow[]).map((row) => row.bay_id).filter((id): id is string => Boolean(id))
    );

    const bays = ((baysResult.data ?? []) as BayRow[]).map((bay) => {
      const agent = agentsByBayId.get(bay.id);
      const lastSeenMs = agent?.last_seen_at ? new Date(agent.last_seen_at).getTime() : 0;
      const mapping = getBayAutomationByCode(bay.bay_code);
      const power = mapping
        ? getPowerState(latestRuns, mapping.enterScript, mapping.exitScript)
        : { on: null, failed: false, lastRunAt: null };

      return {
        id: bay.id,
        code: bay.bay_code,
        name: bay.display_name ?? bay.bay_code,
        pcName: agent?.pc_name ?? null,
        agentOnline:
          agent?.is_active !== false && lastSeenMs > 0 && Date.now() - lastSeenMs <= AGENT_ONLINE_THRESHOLD_MS,
        lastSeenAt: agent?.last_seen_at ?? null,
        hasAutomation: Boolean(mapping),
        powerOn: power.on,
        powerFailed: power.failed,
        powerLastRunAt: power.lastRunAt,
        inUse: activeBayIds.has(bay.id)
      };
    });

    let schedule = null;
    let scheduleAvailable = true;
    try {
      schedule = await getStoreAutomationSchedule(supabase, storeId);
    } catch {
      scheduleAvailable = false;
    }

    return NextResponse.json({
      ok: true,
      controllerEnabled,
      controllerStalled,
      pendingCommandCount: (queueResult.data ?? []).length,
      stalePendingCount: staleControllerCommands.length,
      oldestPendingAt:
        staleControllerCommands.length > 0
          ? staleControllerCommands.reduce((oldest, row) =>
              new Date(row.created_at).getTime() < new Date(oldest).getTime() ? row.created_at : oldest
            , staleControllerCommands[0].created_at)
          : null,
      sessions,
      logs,
      bays,
      schedule,
      scheduleAvailable
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "무인제어 현황을 불러오지 못했습니다." },
      { status: 500 }
    );
  }
}

type ActionBody = {
  action?: unknown;
  bayId?: unknown;
  force?: unknown;
  enabled?: unknown;
  openTime?: unknown;
  closeTime?: unknown;
};

export async function POST(request: NextRequest) {
  const { context, denied } = await requireContext();
  if (denied) return denied;
  const storeId = context!.storeId;

  let body: ActionBody;
  try {
    body = (await request.json()) as ActionBody;
  } catch {
    return NextResponse.json({ ok: false, message: "요청 내용을 확인해 주세요." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();

    if (body.action === "close_expired") {
      const result = await closeExpiredSessions(supabase, new Date(), { storeId });
      return NextResponse.json({
        ok: true,
        message:
          result.scanned === 0
            ? "정리할 종료 초과 이용이 없습니다."
            : `${result.completed}건의 종료 초과 이용을 정리했습니다.`,
        result
      });
    }

    if (body.action === "save_schedule") {
      const enabled = body.enabled === true;
      const openTime = typeof body.openTime === "string" ? body.openTime : "";
      const closeTime = typeof body.closeTime === "string" ? body.closeTime : "";
      const validClock = /^([01]\d|2[0-3]):[0-5]\d$/;

      if (!validClock.test(openTime) || !validClock.test(closeTime)) {
        return NextResponse.json({ ok: false, message: "시작 시간과 종료 시간을 확인해주세요." }, { status: 400 });
      }
      if (openTime >= closeTime) {
        return NextResponse.json({ ok: false, message: "종료 시간은 시작 시간보다 늦어야 합니다." }, { status: 400 });
      }

      const { error } = await supabase.from("store_settings").upsert(
        {
          store_id: storeId,
          automation_schedule_enabled: enabled,
          automation_open_time: openTime,
          automation_close_time: closeTime,
          automation_timezone: "Asia/Seoul"
        },
        { onConflict: "store_id" }
      );
      if (error) throw new Error(error.message);

      return NextResponse.json({
        ok: true,
        message: enabled ? "매장 운영시간 자동제어를 저장했습니다." : "운영시간 자동제어를 껐습니다."
      });
    }

    if (body.action === "pc_shutdown") {
      if (typeof body.bayId !== "string" || body.bayId.length === 0) {
        return NextResponse.json({ ok: false, message: "종료할 타석 PC를 선택해주세요." }, { status: 400 });
      }

      const { data: bay, error: bayError } = await supabase
        .from("bays")
        .select("id, bay_code")
        .eq("id", body.bayId)
        .eq("store_id", storeId)
        .maybeSingle();

      if (bayError) throw new Error(bayError.message);
      if (!bay) {
        return NextResponse.json({ ok: false, message: "타석 정보를 찾을 수 없습니다." }, { status: 404 });
      }

      if (body.force !== true) {
        const { count, error: countError } = await supabase
          .from("access_sessions")
          .select("id", { count: "exact", head: true })
          .eq("bay_id", bay.id)
          .in("status", ["active", "extended", "overdue"]);

        if (countError) throw new Error(countError.message);
        if ((count ?? 0) > 0) {
          return NextResponse.json(
            {
              ok: false,
              requiresForce: true,
              message: `${bay.bay_code}은 현재 고객 이용 중입니다. 그래도 PC를 종료하려면 한 번 더 확인해주세요.`
            },
            { status: 409 }
          );
        }
      }

      const result = await enqueueBayAgentShutdown(supabase, storeId, bay.id);
      if (!result.agentOnline) {
        return NextResponse.json(
          { ok: false, message: `${bay.bay_code} Agent가 연결되어 있지 않아 PC 종료 명령을 보낼 수 없습니다.` },
          { status: 409 }
        );
      }

      return NextResponse.json({
        ok: true,
        message: result.reused > 0
          ? `${bay.bay_code} PC 종료 명령이 이미 전달되어 처리 중입니다.`
          : `${bay.bay_code} PC에 Windows 정상 종료 명령을 전달했습니다. 약 10초 후 종료됩니다.`,
        result
      });
    }

    if (body.action === "bay_off" || body.action === "bay_on") {
      if (!isStoreControllerEnabled()) {
        return NextResponse.json(
          { ok: false, message: "매장 제어기가 아직 활성화되지 않았습니다. 매장 노트북의 제어기 실행 상태를 확인해 주세요." },
          { status: 409 }
        );
      }

      const turningOn = body.action === "bay_on";

      if (typeof body.bayId !== "string" || body.bayId.length === 0) {
        return NextResponse.json({ ok: false, message: "제어할 타석을 선택해주세요." }, { status: 400 });
      }

      const { data: bay, error: bayError } = await supabase
        .from("bays")
        .select("id, store_id, bay_code")
        .eq("id", body.bayId)
        .eq("store_id", storeId)
        .maybeSingle();

      if (bayError) throw new Error(bayError.message);
      if (!bay) {
        return NextResponse.json({ ok: false, message: "타석 정보를 찾을 수 없습니다." }, { status: 404 });
      }

      const mapping = getBayAutomationByCode(bay.bay_code);
      if (!mapping) {
        return NextResponse.json(
          { ok: false, message: `이 타석의 장비 ${turningOn ? "ON" : "OFF"} 연결 정보가 없습니다.` },
          { status: 409 }
        );
      }

      // 이용 중인 타석을 실수로 끄면 고객 화면이 꺼진다. 확인 없이는 막는다.
      if (!turningOn && body.force !== true) {
        const { count, error: countError } = await supabase
          .from("access_sessions")
          .select("id", { count: "exact", head: true })
          .eq("bay_id", bay.id)
          .in("status", ["active", "extended", "overdue"]);

        if (countError) throw new Error(countError.message);
        if ((count ?? 0) > 0) {
          return NextResponse.json(
            {
              ok: false,
              requiresForce: true,
              message: `${mapping.label}은 현재 고객 이용 중입니다. 그래도 장비를 끄려면 한 번 더 확인해주세요.`
            },
            { status: 409 }
          );
        }
      }

      const command = await enqueueManualAutomation(supabase, {
        storeId,
        scripts: [
          {
            name: `${mapping.label} 장비 ${turningOn ? "ON" : "OFF"}`,
            script: turningOn ? mapping.enterScript : mapping.exitScript
          }
        ],
        action: `${body.action}:${bay.bay_code}`
      });

      return NextResponse.json({
        ok: true,
        message: turningOn
          ? `${mapping.label} 장비 ON 명령을 매장 제어기에 전달했습니다. 프로젝터가 켜진 뒤 PC가 부팅됩니다.`
          : `${mapping.label} 장비 OFF 명령을 매장 제어기에 전달했습니다. PC는 안전을 위해 강제 종료하지 않습니다.`,
        command
      });
    }

    if (body.action === "store_close") {
      const controllerEnabled = isStoreControllerEnabled();
      const force = body.force === true;

      // 예외 상황: 관리자가 강제 종료하면 이용 중 세션까지 먼저 닫아 타석을 반납한다.
      // 유령 세션(종료시각이 지났는데 active 로 남은 것) 때문에 매장 종료가 막힐 때 쓴다.
      let forcedClosed = 0;
      if (force) {
        const cleanup = await closeExpiredSessions(supabase, new Date(), { storeId, force: true });
        forcedClosed = cleanup.completed;
      }

      const result = await enqueueStoreClosure(supabase, storeId, "admin_store_close", {
        includeEquipment: controllerEnabled
      });
      if (result.blocked) {
        return NextResponse.json(
          {
            ok: false,
            requiresForce: true,
            activeSessionCount: result.activeSessionCount,
            message: `현재 이용 중이거나 종료 확인이 필요한 타석이 ${result.activeSessionCount}개 있습니다. 그래도 모두 종료하려면 한 번 더 확인해주세요.`
          },
          { status: 409 }
        );
      }

      const shutdownCount = result.agentShutdown.queued + result.agentShutdown.reused;
      if (!controllerEnabled && shutdownCount === 0) {
        return NextResponse.json(
          { ok: false, message: "매장 제어기도 온라인 Agent도 없어 종료할 장비를 확인할 수 없습니다." },
          { status: 409 }
        );
      }

      const forcedNote = forcedClosed > 0 ? ` 이용 중이던 ${forcedClosed}타석을 먼저 종료 처리했습니다.` : "";
      return NextResponse.json({
        ok: true,
        message: (controllerEnabled
          ? `타석 PC ${shutdownCount}대의 정상 종료와 모든 장비·조명·냉난방 OFF 명령을 전달했습니다.`
          : `온라인 Agent가 있는 타석 PC ${shutdownCount}대에 정상 종료 명령을 전달했습니다. 매장 제어기가 없어 프로젝터·타석 장비·조명·냉난방 OFF는 실행하지 않았습니다.`) + forcedNote,
        command: result.command,
        agentShutdown: result.agentShutdown,
        controllerEnabled,
        forcedClosed
      });
    }

    if (!isStoreControllerEnabled()) {
      return NextResponse.json(
        { ok: false, message: "매장 제어기가 아직 활성화되지 않았습니다. 매장 노트북의 제어기 실행 상태를 확인해 주세요." },
        { status: 409 }
      );
    }

    // 조명·냉난방과 모든 타석 장비를 한 번에 켠다. 단체 예약이나 점검 준비용.
    // 평소 영업은 손님이 입장할 때 해당 타석만 켜지므로 이 동작이 필요 없다.
    if (body.action === "store_prepare") {
      const result = await enqueueStorePreparation(supabase, storeId, "admin_store_prepare");

      return NextResponse.json({
        ok: true,
        message: `공용 조명·냉난방과 타석 ${result.bayCount}곳의 장비 ON 명령을 전달했습니다.`,
        command: result.command
      });
    }

    const scriptsByAction = {
      shared_on: [{ name: "공용 장비 준비", script: commonAutomationScripts.on }],
      shared_off: [{ name: "공용 장비 종료", script: commonAutomationScripts.off }]
    } as const;

    if (body.action === "shared_on" || body.action === "shared_off") {
      const command = await enqueueManualAutomation(supabase, {
        storeId,
        scripts: [...scriptsByAction[body.action]],
        action: body.action
      });
      return NextResponse.json({ ok: true, message: "매장 제어기에 명령을 전달했습니다.", command });
    }

    return NextResponse.json({ ok: false, message: "지원하지 않는 제어 요청입니다." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "무인제어 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
