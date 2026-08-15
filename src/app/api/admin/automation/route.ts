import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  commonAutomationScripts,
  getBayAutomationByCode,
  siheungBayAutomation
} from "@/lib/automation/device-map";
import { enqueueManualAutomation, isStoreControllerEnabled } from "@/lib/store-controller";
import { closeExpiredSessions } from "@/lib/session-cleanup";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const CURRENT_STORE_ID = "11111111-1111-4111-8111-111111111111";

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

type BayRow = { id: string; bay_code: string; display_name: string | null };
type AgentRow = {
  bay_id: string | null;
  pc_name: string | null;
  is_active: boolean | null;
  last_seen_at: string | null;
};

const AGENT_ONLINE_THRESHOLD_MS = 120_000;

const commandTypeLabels: Record<string, string> = {
  prepare_bay: "타석 준비",
  release_bay: "타석 이용 종료",
  run_scripts: "관리자 장비 제어"
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

async function ensureAdmin() {
  try {
    await requireAdminUser();
    return null;
  } catch {
    return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  }
}

export async function GET() {
  const denied = await ensureAdmin();
  if (denied) return denied;

  try {
    const supabase = createSupabaseAdminClient();
    const [sessionsResult, logsResult, baysResult, agentsResult] = await Promise.all([
      supabase
        .from("access_sessions")
        .select("id, bay_id, guest_name, started_at, ends_at, status, bays(bay_code, display_name)")
        .eq("store_id", CURRENT_STORE_ID)
        .in("status", ["active", "extended", "overdue"])
        .order("started_at", { ascending: false }),
      supabase
        .from("store_controller_commands")
        .select("id, created_at, command_type, status, error_message, payload")
        .eq("store_id", CURRENT_STORE_ID)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("bays")
        .select("id, bay_code, display_name")
        .eq("store_id", CURRENT_STORE_ID)
        .order("bay_code", { ascending: true }),
      supabase
        .from("agent_devices")
        .select("bay_id, pc_name, is_active, last_seen_at")
        .eq("store_id", CURRENT_STORE_ID)
    ]);

    if (sessionsResult.error) throw new Error(sessionsResult.error.message);
    if (logsResult.error) throw new Error(logsResult.error.message);
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

    const agentsByBayId = new Map<string, AgentRow>();
    for (const agent of (agentsResult.data ?? []) as AgentRow[]) {
      if (!agent.bay_id) continue;
      const previous = agentsByBayId.get(agent.bay_id);
      if (!previous || new Date(agent.last_seen_at ?? 0).getTime() > new Date(previous.last_seen_at ?? 0).getTime()) {
        agentsByBayId.set(agent.bay_id, agent);
      }
    }

    const bays = ((baysResult.data ?? []) as BayRow[]).map((bay) => {
      const agent = agentsByBayId.get(bay.id);
      const lastSeenMs = agent?.last_seen_at ? new Date(agent.last_seen_at).getTime() : 0;
      return {
        id: bay.id,
        code: bay.bay_code,
        name: bay.display_name ?? bay.bay_code,
        pcName: agent?.pc_name ?? null,
        agentOnline:
          agent?.is_active !== false && lastSeenMs > 0 && Date.now() - lastSeenMs <= AGENT_ONLINE_THRESHOLD_MS,
        lastSeenAt: agent?.last_seen_at ?? null,
        hasAutomation: Boolean(getBayAutomationByCode(bay.bay_code))
      };
    });

    return NextResponse.json({
      ok: true,
      controllerEnabled: isStoreControllerEnabled(),
      sessions,
      logs,
      bays
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "무인제어 현황을 불러오지 못했습니다." },
      { status: 500 }
    );
  }
}

type ActionBody = { action?: unknown; bayId?: unknown };

export async function POST(request: NextRequest) {
  const denied = await ensureAdmin();
  if (denied) return denied;

  let body: ActionBody;
  try {
    body = (await request.json()) as ActionBody;
  } catch {
    return NextResponse.json({ ok: false, message: "요청 내용을 확인해 주세요." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();

    if (body.action === "close_expired") {
      const result = await closeExpiredSessions(supabase);
      return NextResponse.json({
        ok: true,
        message:
          result.scanned === 0
            ? "정리할 종료 초과 이용이 없습니다."
            : `${result.completed}건의 종료 초과 이용을 정리했습니다.`,
        result
      });
    }

    if (!isStoreControllerEnabled()) {
      return NextResponse.json(
        { ok: false, message: "매장 제어기가 아직 활성화되지 않았습니다. 매장 노트북의 제어기 실행 상태를 확인해 주세요." },
        { status: 409 }
      );
    }

    if (body.action === "bay_off") {
      if (typeof body.bayId !== "string" || body.bayId.length === 0) {
        return NextResponse.json({ ok: false, message: "종료할 타석을 선택해주세요." }, { status: 400 });
      }

      const { data: bay, error: bayError } = await supabase
        .from("bays")
        .select("id, store_id, bay_code")
        .eq("id", body.bayId)
        .eq("store_id", CURRENT_STORE_ID)
        .maybeSingle();

      if (bayError) throw new Error(bayError.message);
      if (!bay) {
        return NextResponse.json({ ok: false, message: "타석 정보를 찾을 수 없습니다." }, { status: 404 });
      }

      const mapping = getBayAutomationByCode(bay.bay_code);
      if (!mapping) {
        return NextResponse.json({ ok: false, message: "이 타석의 장비 OFF 연결 정보가 없습니다." }, { status: 409 });
      }

      const command = await enqueueManualAutomation(supabase, {
        storeId: CURRENT_STORE_ID,
        scripts: [{ name: `${mapping.label} 장비 OFF`, script: mapping.exitScript }],
        action: `bay_off:${bay.bay_code}`
      });

      return NextResponse.json({
        ok: true,
        message: `${mapping.label} 장비 OFF 명령을 매장 제어기에 전달했습니다. PC는 안전을 위해 강제 종료하지 않습니다.`,
        command
      });
    }

    if (body.action === "store_close") {
      const { count: activeSessionCount, error: activeSessionError } = await supabase
        .from("access_sessions")
        .select("id", { count: "exact", head: true })
        .eq("store_id", CURRENT_STORE_ID)
        .in("status", ["active", "extended", "overdue"]);

      if (activeSessionError) throw new Error(activeSessionError.message);
      if ((activeSessionCount ?? 0) > 0) {
        return NextResponse.json(
          {
            ok: false,
            message: `현재 이용 중이거나 종료 확인이 필요한 타석이 ${activeSessionCount}개 있습니다. 먼저 이용 종료 처리 후 매장 종료를 실행해주세요.`
          },
          { status: 409 }
        );
      }

      const scripts = [
        ...siheungBayAutomation.map((bay) => ({
          name: `${bay.label} 장비 OFF`,
          script: bay.exitScript
        })),
        { name: "공용 조명·냉난방 OFF", script: commonAutomationScripts.off }
      ];
      const command = await enqueueManualAutomation(supabase, {
        storeId: CURRENT_STORE_ID,
        scripts,
        action: "store_close"
      });

      return NextResponse.json({
        ok: true,
        message: "모든 타석 장비와 공용 조명·냉난방 OFF 명령을 순서대로 전달했습니다. PC는 Agent 안전 종료 기능 적용 전까지 정상 종료를 별도로 확인해주세요.",
        command
      });
    }

    const scriptsByAction = {
      shared_on: [{ name: "공용 장비 준비", script: commonAutomationScripts.on }],
      shared_off: [{ name: "공용 장비 종료", script: commonAutomationScripts.off }]
    } as const;

    if (body.action === "shared_on" || body.action === "shared_off") {
      const command = await enqueueManualAutomation(supabase, {
        storeId: CURRENT_STORE_ID,
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
