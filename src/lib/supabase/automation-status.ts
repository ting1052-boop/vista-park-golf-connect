import type { SupabaseClient } from "@supabase/supabase-js";
import { commonAutomationScripts, siheungBayAutomation } from "@/lib/automation/device-map";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

// 대시보드 "무인 장비 상태" 표에 쓰는 실제 실행 상태.
//
// 출처는 store_controller_commands 다. 매장 로컬 제어기가 명령을 가져가 실행한 뒤
// 스크립트별 성공 여부를 response_payload.steps 에 기록하므로, 이 기록만으로
// 각 타석 장비를 마지막으로 켰는지 껐는지 판단할 수 있다.
//
// 참고: 스키마에는 automation_logs 도 있으나 운영 DB에는 아직 생성되어 있지
// 않아(2026-08-15 확인) 여기서는 사용하지 않는다.

const COMMAND_SCAN_LIMIT = 200;

export type AutomationDeviceStatusRow = {
  zone: string;
  device: string;
  provider: string;
  /** 마지막으로 확인된 전원 상태 표시용 문구 */
  state: string;
  /** 상태 색상 판단용 */
  tone: "on" | "off" | "failed" | "unknown";
  /** 마지막 실행 시각(ISO). 실행 이력이 없으면 null */
  lastRunAt: string | null;
  /** 실행 이력이 없을 때 대신 보여줄 안내 */
  action: string;
};

type ControllerCommandRecord = {
  status: string | null;
  created_at: string;
  completed_at: string | null;
  response_payload: unknown;
};

export type ScriptRun = { ok: boolean; at: string };

/** 스크립트 하나의 마지막 실행 결과로 본 전원 상태 */
export type PowerState = {
  /** true = 마지막으로 ON 실행됨, false = OFF, null = 실행 이력 없음 */
  on: boolean | null;
  /** 마지막 실행이 실패했는지 */
  failed: boolean;
  lastRunAt: string | null;
};

function readSteps(payload: unknown): Array<{ script?: unknown; ok?: unknown }> {
  if (!payload || typeof payload !== "object") return [];
  const steps = (payload as { steps?: unknown }).steps;
  return Array.isArray(steps) ? (steps as Array<{ script?: unknown; ok?: unknown }>) : [];
}

// 스크립트 id -> 가장 최근 실행. 명령을 최신순으로 읽으므로 먼저 만난 것이 최신이다.
function buildLatestRunsByScript(commands: ControllerCommandRecord[]) {
  const latest = new Map<string, ScriptRun>();

  for (const command of commands) {
    const at = command.completed_at ?? command.created_at;

    for (const step of readSteps(command.response_payload)) {
      if (typeof step.script !== "string" || step.script.length === 0) continue;
      if (latest.has(step.script)) continue;
      latest.set(step.script, { ok: step.ok === true, at });
    }
  }

  return latest;
}

// ON 스크립트와 OFF 스크립트의 마지막 실행을 비교해 현재 전원 상태를 추정한다.
function resolveState(
  onRun: ScriptRun | undefined,
  offRun: ScriptRun | undefined
): Pick<AutomationDeviceStatusRow, "state" | "tone" | "lastRunAt"> {
  if (!onRun && !offRun) {
    return { state: "실행 이력 없음", tone: "unknown", lastRunAt: null };
  }

  const newest =
    onRun && offRun ? (new Date(onRun.at) >= new Date(offRun.at) ? onRun : offRun) : onRun ?? offRun!;
  const isOnNewest = newest === onRun;

  if (!newest.ok) {
    return {
      state: isOnNewest ? "켜기 실패 · 확인 필요" : "끄기 실패 · 확인 필요",
      tone: "failed",
      lastRunAt: newest.at
    };
  }

  return {
    state: isOnNewest ? "ON (이용 준비됨)" : "OFF (대기)",
    tone: isOnNewest ? "on" : "off",
    lastRunAt: newest.at
  };
}

function describeProvider(providers: string[]) {
  const labels = providers.map((provider) => (provider === "tapo" ? "Tapo 플러그" : "헤이홈"));
  return [...new Set(labels)].join(" · ");
}

/**
 * 매장 제어기 실행 기록에서 스크립트별 마지막 실행 결과를 읽어온다.
 * 대시보드 장비 상태 표와 무인제어 화면의 ON/OFF 토글이 같은 기준을 쓰도록 공유한다.
 */
export async function getLatestScriptRuns(
  supabase: SupabaseClient,
  storeId: string
): Promise<Map<string, ScriptRun>> {
  const { data, error } = await supabase
    .from("store_controller_commands")
    .select("status, created_at, completed_at, response_payload")
    .eq("store_id", storeId)
    .in("status", ["succeeded", "failed"])
    .order("created_at", { ascending: false })
    .limit(COMMAND_SCAN_LIMIT);

  if (error) throw new Error(error.message);

  return buildLatestRunsByScript((data ?? []) as ControllerCommandRecord[]);
}

/** ON/OFF 스크립트의 마지막 실행을 비교해 전원 상태를 판단한다. */
export function getPowerState(
  latest: Map<string, ScriptRun>,
  onScript: string,
  offScript: string
): PowerState {
  const onRun = latest.get(onScript);
  const offRun = latest.get(offScript);

  if (!onRun && !offRun) return { on: null, failed: false, lastRunAt: null };

  const newest =
    onRun && offRun ? (new Date(onRun.at) >= new Date(offRun.at) ? onRun : offRun) : onRun ?? offRun!;

  return { on: newest === onRun, failed: !newest.ok, lastRunAt: newest.at };
}

export async function getAutomationDeviceStatuses(storeId: string): Promise<AutomationDeviceStatusRow[]> {
  const supabase = createSupabaseAdminClient();
  const latest = await getLatestScriptRuns(supabase, storeId);

  const commonState = resolveState(latest.get(commonAutomationScripts.on), latest.get(commonAutomationScripts.off));
  const rows: AutomationDeviceStatusRow[] = [
    {
      zone: "공용",
      device: "로비·홀 조명, 스크린룸, 냉난방",
      provider: "헤이홈",
      ...commonState,
      action: "첫 입장 시 ON · 마지막 퇴장 시 OFF"
    }
  ];

  for (const bay of siheungBayAutomation) {
    const bayState = resolveState(latest.get(bay.enterScript), latest.get(bay.exitScript));
    rows.push({
      zone: bay.label,
      device: bay.devices.map((device) => device.name).join(", "),
      provider: describeProvider(bay.devices.map((device) => device.provider)),
      ...bayState,
      action: "입장 시 프로젝터·PC ON · 이용 종료 시 OFF"
    });
  }

  return rows;
}
