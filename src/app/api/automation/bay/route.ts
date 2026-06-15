import { NextRequest, NextResponse } from "next/server";
import { runBayAutomation } from "@/lib/automation/sessions";
import type { AutomationAction } from "@/lib/automation/device-map";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type BayAutomationBody = {
  bayId?: unknown;
  action?: unknown;
  accessSessionId?: unknown;
  reservationId?: unknown;
};

const automationActions = new Set<AutomationAction>(["enter", "exit"]);

function getRequestSecret(request: NextRequest) {
  const headerSecret = request.headers.get("x-iot-webhook-secret");
  const authorization = request.headers.get("authorization");
  const bearerSecret = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : null;

  return headerSecret ?? bearerSecret;
}

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.IOT_WEBHOOK_SECRET;

  if (!expectedSecret) {
    return NextResponse.json({ ok: false, message: "IOT_WEBHOOK_SECRET 환경변수가 설정되지 않았습니다." }, { status: 500 });
  }

  if (getRequestSecret(request) !== expectedSecret) {
    return NextResponse.json({ ok: false, message: "타석 자동화 인증에 실패했습니다." }, { status: 401 });
  }

  let body: BayAutomationBody;
  try {
    body = (await request.json()) as BayAutomationBody;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON 요청 본문을 확인해주세요." }, { status: 400 });
  }

  if (typeof body.bayId !== "string" || body.bayId.trim().length === 0) {
    return NextResponse.json({ ok: false, message: "bayId가 올바르지 않습니다." }, { status: 400 });
  }

  if (typeof body.action !== "string" || !automationActions.has(body.action as AutomationAction)) {
    return NextResponse.json({ ok: false, message: "action은 enter 또는 exit만 가능합니다." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const result = await runBayAutomation({
      supabase,
      bayId: body.bayId,
      action: body.action as AutomationAction,
      accessSessionId: typeof body.accessSessionId === "string" ? body.accessSessionId : null,
      reservationId: typeof body.reservationId === "string" ? body.reservationId : null
    });

    return NextResponse.json({
      ok: result.steps.every((step) => step.ok && !step.logError),
      message: "타석 자동화 명령을 처리했습니다.",
      bay: result.bay,
      activeSessionCount: result.activeSessionCount,
      commonAction: result.commonAction,
      steps: result.steps,
      note: "입장/퇴장 자동화는 access_sessions 상태를 먼저 저장한 뒤 호출해야 첫 입장/마지막 퇴장을 정확히 판단합니다."
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "타석 자동화 처리 중 오류가 발생했습니다."
      },
      { status: 500 }
    );
  }
}
