import type { SupabaseClient } from "@supabase/supabase-js";
import { commonAutomationScripts, getBayAutomationByCode } from "@/lib/automation/device-map";
import { enqueueManualAutomation, isStoreControllerEnabled } from "@/lib/store-controller";
import { getLatestScriptRuns, getPowerState } from "@/lib/supabase/automation-status";

// 예약 시작 전에 타석 장비를 미리 켠다.
//
// 이전 구현은 Vercel 에서 Home Assistant 를 직접 호출했다. 클라우드에서 매장
// 사설망에 닿을 수 없어 항상 실패하는 코드였다. 지금은 매장 로컬 제어기에
// 명령을 넣고, 제어기가 매장 안에서 실행한다.
//
// 이미 켜져 있으면 명령을 넣지 않는다. 프로젝터 램프가 소모품이라 같은 ON 을
// 반복하지 않는 편이 낫고, 손님이 이미 이용 중인 타석을 건드릴 이유도 없다.

export const PREPARE_LEAD_MINUTES = 10;

// 시작 시각이 한참 지난 예약까지 뒤늦게 켜지 않는다.
const PREPARE_GRACE_MINUTES = 5;
const MAX_RESERVATIONS_PER_RUN = 10;

type DueReservation = {
  id: string;
  store_id: string;
  bay_id: string | null;
  starts_at: string;
};

export type PrepareOutcome = {
  reservationId: string;
  status: "queued" | "already_on" | "skipped";
  reason?: string;
};

export type PrepareRunResult = {
  scanned: number;
  queued: number;
  outcomes: PrepareOutcome[];
};

/**
 * 곧 시작하는 예약의 타석을 미리 켠다.
 * 제어기가 꺼져 있거나 대상이 없으면 아무것도 하지 않는다.
 */
export async function prepareDueReservations(
  supabase: SupabaseClient,
  storeId: string,
  now = new Date()
): Promise<PrepareRunResult> {
  const empty: PrepareRunResult = { scanned: 0, queued: 0, outcomes: [] };
  if (!isStoreControllerEnabled()) return empty;

  const windowStart = new Date(now.getTime() - PREPARE_GRACE_MINUTES * 60_000);
  const windowEnd = new Date(now.getTime() + PREPARE_LEAD_MINUTES * 60_000);

  const { data, error } = await supabase
    .from("reservations")
    .select("id, store_id, bay_id, starts_at")
    .eq("store_id", storeId)
    .in("status", ["confirmed", "checked_in"])
    .is("automation_prepare_status", null)
    .gte("starts_at", windowStart.toISOString())
    .lte("starts_at", windowEnd.toISOString())
    .order("starts_at", { ascending: true })
    .limit(MAX_RESERVATIONS_PER_RUN);

  if (error) throw new Error(error.message);

  const due = (data ?? []) as DueReservation[];
  if (due.length === 0) return empty;

  const latestRuns = await getLatestScriptRuns(supabase, storeId);
  const outcomes: PrepareOutcome[] = [];
  let queued = 0;

  for (const reservation of due) {
    const outcome = await prepareOne(supabase, reservation, latestRuns);
    outcomes.push(outcome);
    if (outcome.status === "queued") queued += 1;
  }

  return { scanned: due.length, queued, outcomes };
}

async function prepareOne(
  supabase: SupabaseClient,
  reservation: DueReservation,
  latestRuns: Awaited<ReturnType<typeof getLatestScriptRuns>>
): Promise<PrepareOutcome> {
  const markDone = async (status: string) => {
    await supabase
      .from("reservations")
      .update({ automation_prepare_status: status, automation_prepared_at: new Date().toISOString() })
      .eq("id", reservation.id)
      .is("automation_prepare_status", null);
  };

  if (!reservation.bay_id) {
    await markDone("skipped_no_bay");
    return { reservationId: reservation.id, status: "skipped", reason: "타석 미배정" };
  }

  const { data: bay, error: bayError } = await supabase
    .from("bays")
    .select("bay_code")
    .eq("id", reservation.bay_id)
    .maybeSingle();

  if (bayError) throw new Error(bayError.message);

  const mapping = getBayAutomationByCode(bay?.bay_code ?? null);
  if (!mapping) {
    await markDone("skipped_no_mapping");
    return { reservationId: reservation.id, status: "skipped", reason: "자동화 매핑 없음" };
  }

  // 이미 켜져 있으면 다시 켜지 않는다.
  const bayPower = getPowerState(latestRuns, mapping.enterScript, mapping.exitScript);
  if (bayPower.on === true && !bayPower.failed) {
    await markDone("already_on");
    return { reservationId: reservation.id, status: "already_on" };
  }

  const sharedPower = getPowerState(latestRuns, commonAutomationScripts.on, commonAutomationScripts.off);
  const scripts = [{ name: `${mapping.label} 장비 ON`, script: mapping.enterScript }];
  if (!(sharedPower.on === true && !sharedPower.failed)) {
    scripts.unshift({ name: "공용 조명·냉난방 ON", script: commonAutomationScripts.on });
  }

  // 먼저 표시하고 명령을 넣는다. 표시에 실패하면(이미 다른 실행이 가져갔으면)
  // 명령을 넣지 않아 같은 예약이 두 번 켜지지 않는다.
  const { data: claimed, error: claimError } = await supabase
    .from("reservations")
    .update({ automation_prepare_status: "queued", automation_prepared_at: new Date().toISOString() })
    .eq("id", reservation.id)
    .is("automation_prepare_status", null)
    .select("id");

  if (claimError) throw new Error(claimError.message);
  if (!claimed || claimed.length === 0) {
    return { reservationId: reservation.id, status: "skipped", reason: "이미 처리됨" };
  }

  try {
    await enqueueManualAutomation(supabase, {
      storeId: reservation.store_id,
      scripts,
      action: `reservation_prepare:${reservation.id}`
    });
  } catch (caught) {
    // 명령을 넣지 못했으면 다음 실행이 다시 시도할 수 있게 표시를 되돌린다.
    await supabase
      .from("reservations")
      .update({ automation_prepare_status: null, automation_prepared_at: null })
      .eq("id", reservation.id);
    throw caught;
  }

  return { reservationId: reservation.id, status: "queued" };
}
