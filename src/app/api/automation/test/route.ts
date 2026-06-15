import { NextRequest, NextResponse } from "next/server";
import { automationTestScripts, type AutomationTestTarget } from "@/lib/automation/device-map";
import { pingHomeAssistant, runHomeAssistantScript } from "@/lib/automation/ha-client";

type AutomationTestBody = {
  target?: unknown;
};

const testTargets = new Set<AutomationTestTarget>([
  "ping",
  "common_on",
  "common_off",
  "bay_01_enter",
  "bay_01_exit",
  "bay_02_enter",
  "bay_02_exit",
  "bay_03_enter",
  "bay_03_exit",
  "test_bay_01_pc_on",
  "test_bay_01_pc_off"
]);

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
    return NextResponse.json({ ok: false, message: "자동화 테스트 인증에 실패했습니다." }, { status: 401 });
  }

  let body: AutomationTestBody;
  try {
    body = (await request.json()) as AutomationTestBody;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON 요청 본문을 확인해주세요." }, { status: 400 });
  }

  if (typeof body.target !== "string" || !testTargets.has(body.target as AutomationTestTarget)) {
    return NextResponse.json({ ok: false, message: "target 값이 올바르지 않습니다." }, { status: 400 });
  }

  const target = body.target as AutomationTestTarget;

  try {
    const result = target === "ping" ? await pingHomeAssistant() : await runHomeAssistantScript(automationTestScripts[target]);

    return NextResponse.json({
      ok: result.ok,
      target,
      status: result.status,
      body: result.body
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        target,
        message: error instanceof Error ? error.message : "자동화 테스트 중 오류가 발생했습니다."
      },
      { status: 500 }
    );
  }
}
