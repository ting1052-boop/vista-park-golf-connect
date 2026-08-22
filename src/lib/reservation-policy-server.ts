import type { SupabaseClient } from "@supabase/supabase-js";
import { durationOptions as defaultDurationOptions } from "@/lib/reservation-policy";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

// 매장별 이용시간·요금표. 관리자 화면에서 store_settings.duration_options 에
// 저장하고, 값이 없으면 코드의 기본 요금표를 그대로 쓴다.

export type StoreDurationOption = {
  minutes: number;
  price: number;
  bonusMinutes: number;
};

export const MAX_DURATION_OPTIONS = 8;

export function getDefaultDurationOptions(): StoreDurationOption[] {
  return defaultDurationOptions.map((option) => ({
    minutes: option.minutes,
    price: option.price,
    bonusMinutes: option.bonusMinutes
  }));
}

/**
 * 저장하려는 요금표를 검증한다.
 * 손님에게 그대로 노출되고 실제 과금 기준이 되는 값이라, 저장 전에 형식을 확인한다.
 */
export function parseDurationOptions(input: unknown): { options: StoreDurationOption[] } | { error: string } {
  if (!Array.isArray(input) || input.length === 0) {
    return { error: "이용시간을 1개 이상 등록해주세요." };
  }
  if (input.length > MAX_DURATION_OPTIONS) {
    return { error: `이용시간은 최대 ${MAX_DURATION_OPTIONS}개까지 등록할 수 있습니다.` };
  }

  const options: StoreDurationOption[] = [];

  for (const raw of input) {
    if (!raw || typeof raw !== "object") return { error: "이용시간 형식이 올바르지 않습니다." };

    const minutes = Number((raw as StoreDurationOption).minutes);
    const price = Number((raw as StoreDurationOption).price);
    const bonusMinutes = Number((raw as StoreDurationOption).bonusMinutes ?? 0);

    if (!Number.isInteger(minutes) || minutes < 10 || minutes > 600) {
      return { error: "이용시간은 10분 이상 600분 이하로 입력해주세요." };
    }
    if (!Number.isInteger(price) || price < 0 || price > 1_000_000) {
      return { error: "요금은 0원 이상 1,000,000원 이하로 입력해주세요." };
    }
    if (!Number.isInteger(bonusMinutes) || bonusMinutes < 0 || bonusMinutes > 120) {
      return { error: "서비스 시간은 0분 이상 120분 이하로 입력해주세요." };
    }
    if (options.some((option) => option.minutes === minutes)) {
      return { error: `이용시간 ${minutes}분이 중복됩니다.` };
    }

    options.push({ minutes, price, bonusMinutes });
  }

  options.sort((a, b) => a.minutes - b.minutes);
  return { options };
}

/**
 * 매장 요금표를 읽는다.
 * duration_options 컬럼이 아직 없는 환경(마이그레이션 미적용)이나 값이 비어 있으면
 * 기본 요금표로 조용히 넘어간다. 요금 조회 실패로 예약 화면 전체가 막히면 안 된다.
 */
export async function getStoreDurationOptions(
  storeId: string,
  supabase: SupabaseClient = createSupabaseAdminClient()
): Promise<StoreDurationOption[]> {
  try {
    const { data, error } = await supabase
      .from("store_settings")
      .select("duration_options")
      .eq("store_id", storeId)
      .maybeSingle();

    if (error || !data?.duration_options) return getDefaultDurationOptions();

    const parsed = parseDurationOptions(data.duration_options);
    if ("error" in parsed) return getDefaultDurationOptions();

    return parsed.options;
  } catch {
    return getDefaultDurationOptions();
  }
}

export function findDurationOption(options: StoreDurationOption[], minutes: number) {
  return options.find((option) => option.minutes === minutes) ?? null;
}
