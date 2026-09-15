import { NextRequest, NextResponse } from "next/server";
import { PREPARE_LEAD_MINUTES, prepareDueReservations } from "@/lib/reservation-prepare";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

// 예약 사전 준비를 수동으로 한 번 돌리는 엔드포인트.
//
// 평상시에는 매장 제어기가 서버를 조회할 때마다 같은 처리가 자동으로 실행되므로
// 이 엔드포인트는 점검·재시도용이다. 실제 장비 실행은 제어기가 맡는다.
// (예전 구현은 Vercel 에서 Home Assistant 를 직접 호출했는데, 클라우드에서
//  매장 사설망에 닿을 수 없어 항상 실패하는 코드였다.)

const CURRENT_STORE_ID = "11111111-1111-4111-8111-111111111111";

function getRequestSecret(request: NextRequest) {
  const headerSecret = request.headers.get("x-cron-secret") ?? request.headers.get("x-iot-webhook-secret");
  const authorization = request.headers.get("authorization");
  const bearerSecret = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : null;

  return headerSecret ?? bearerSecret;
}

export async function GET(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET ?? process.env.IOT_WEBHOOK_SECRET;

  if (!expectedSecret) {
    return NextResponse.json(
      { ok: false, message: "CRON_SECRET 또는 IOT_WEBHOOK_SECRET 환경변수가 필요합니다." },
      { status: 500 }
    );
  }

  if (getRequestSecret(request) !== expectedSecret) {
    return NextResponse.json({ ok: false, message: "예약 준비 자동화 인증에 실패했습니다." }, { status: 401 });
  }

  try {
    const now = new Date();
    const result = await prepareDueReservations(createSupabaseAdminClient(), CURRENT_STORE_ID, now);

    return NextResponse.json({
      ok: true,
      checkedAt: now.toISOString(),
      leadMinutes: PREPARE_LEAD_MINUTES,
      ...result
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "예약 준비 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export const POST = GET;
