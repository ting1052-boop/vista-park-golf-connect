import type { SupabaseClient } from "@supabase/supabase-js";

export type EnrollmentState = {
  open: boolean;
  until: string | null;
  remaining: number | null;
};

export const ENROLLMENT_MAX_MINUTES = 240;
export const ENROLLMENT_MAX_COUNT = 30;
const DEFAULT_MINUTES = 30;
const DEFAULT_COUNT = 10;

type Row = { store_id: string; pc_enrollment_until: string | null; pc_enrollment_remaining: number | null };

/** 시간이 지났거나 남은 횟수를 다 쓰면 닫힌 것으로 본다. 둘 중 하나만 걸려도 닫힌다. */
export function isEnrollmentOpen(until: string | null, remaining: number | null, now: Date) {
  if (!until) return false;
  const expiresAt = new Date(until).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) return false;
  return (remaining ?? 0) > 0;
}

function toState(row: Row | null, now: Date): EnrollmentState {
  const until = row?.pc_enrollment_until ?? null;
  const remaining = row?.pc_enrollment_remaining ?? null;
  return { open: isEnrollmentOpen(until, remaining, now), until, remaining };
}

/** 마이그레이션 전 배포에서는 창구가 없는 것으로 본다. 열지 못할 뿐 기존 토큰 경로는 그대로다. */
function missingColumns(message: string) {
  return message.includes("pc_enrollment_until") || message.includes("pc_enrollment_remaining");
}

export async function getEnrollmentState(
  supabase: SupabaseClient,
  storeId: string,
  now = new Date()
): Promise<EnrollmentState & { supported: boolean }> {
  const { data, error } = await supabase
    .from("store_settings")
    .select("store_id, pc_enrollment_until, pc_enrollment_remaining")
    .eq("store_id", storeId)
    .maybeSingle();

  if (error) {
    if (missingColumns(error.message)) return { open: false, until: null, remaining: null, supported: false };
    throw new Error(error.message);
  }

  return { ...toState(data as Row | null, now), supported: true };
}

/** catalog 는 매장을 특정하지 않고 열린다. 열려 있는 매장만 돌려준다. */
export async function listOpenEnrollmentStoreIds(supabase: SupabaseClient, now = new Date()): Promise<string[]> {
  const { data, error } = await supabase
    .from("store_settings")
    .select("store_id, pc_enrollment_until, pc_enrollment_remaining")
    .not("pc_enrollment_until", "is", null);

  if (error) {
    if (missingColumns(error.message)) return [];
    throw new Error(error.message);
  }

  return ((data ?? []) as Row[]).filter((row) => toState(row, now).open).map((row) => row.store_id);
}

export async function openEnrollment(
  supabase: SupabaseClient,
  storeId: string,
  args: { minutes?: number; count?: number } = {}
) {
  const minutes = Math.min(Math.max(Math.round(args.minutes ?? DEFAULT_MINUTES), 1), ENROLLMENT_MAX_MINUTES);
  const count = Math.min(Math.max(Math.round(args.count ?? DEFAULT_COUNT), 1), ENROLLMENT_MAX_COUNT);
  const until = new Date(Date.now() + minutes * 60_000).toISOString();

  // store_settings 행이 없는 신규 매장도 창을 열 수 있어야 한다.
  const { error } = await supabase
    .from("store_settings")
    .upsert({ store_id: storeId, pc_enrollment_until: until, pc_enrollment_remaining: count }, { onConflict: "store_id" });

  if (error) throw new Error(error.message);
  return { until, remaining: count, minutes };
}

export async function closeEnrollment(supabase: SupabaseClient, storeId: string) {
  const { error } = await supabase
    .from("store_settings")
    .update({ pc_enrollment_until: null, pc_enrollment_remaining: null })
    .eq("store_id", storeId);

  if (error) throw new Error(error.message);
}

/**
 * 신규 장비 하나가 창구를 쓴다. 갱신(updated/unchanged)은 소모하지 않는다.
 * 남은 횟수를 조건에 넣어, 동시에 여러 대가 들어와도 창이 음수로 가지 않는다.
 */
export async function consumeEnrollmentSlot(supabase: SupabaseClient, storeId: string, remaining: number) {
  const { data, error } = await supabase
    .from("store_settings")
    .update({ pc_enrollment_remaining: Math.max(remaining - 1, 0) })
    .eq("store_id", storeId)
    .eq("pc_enrollment_remaining", remaining)
    .select("store_id");

  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}
