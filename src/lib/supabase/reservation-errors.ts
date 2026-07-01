import type { PostgrestError } from "@supabase/supabase-js";

const EXCLUSION_VIOLATION_CODE = "23P01";

export function toReservationErrorMessage(error: PostgrestError): string {
  if (error.code === EXCLUSION_VIOLATION_CODE) {
    return "선택한 타석과 시간대가 이미 예약되어 있습니다. 다른 타석이나 시간을 선택해주세요.";
  }

  return error.message;
}
