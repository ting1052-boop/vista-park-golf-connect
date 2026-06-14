import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type DeviceAction = "ON" | "OFF";
type DeviceType = "projector" | "ac" | "kiosk" | "lighting";
type DeviceLogStatus = "success" | "failed";

type DeviceControlBody = {
  bayId?: unknown;
  action?: unknown;
  deviceType?: unknown;
};

const actionSet = new Set<DeviceAction>(["ON", "OFF"]);
const deviceTypeSet = new Set<DeviceType>(["projector", "ac", "kiosk", "lighting"]);

function getRequestSecret(request: NextRequest) {
  const headerSecret = request.headers.get("x-iot-webhook-secret");
  const authorization = request.headers.get("authorization");
  const bearerSecret = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : null;

  return headerSecret ?? bearerSecret;
}

function validateBody(body: DeviceControlBody) {
  if (typeof body.bayId !== "string" || body.bayId.trim().length === 0) {
    return { ok: false as const, message: "bayId가 올바르지 않습니다." };
  }

  if (typeof body.action !== "string" || !actionSet.has(body.action as DeviceAction)) {
    return { ok: false as const, message: "action은 ON 또는 OFF만 가능합니다." };
  }

  if (typeof body.deviceType !== "string" || !deviceTypeSet.has(body.deviceType as DeviceType)) {
    return { ok: false as const, message: "deviceType이 올바르지 않습니다." };
  }

  return {
    ok: true as const,
    data: {
      bayId: body.bayId,
      action: body.action as DeviceAction,
      deviceType: body.deviceType as DeviceType
    }
  };
}

async function readResponseBody(response: Response) {
  try {
    return (await response.text()).slice(0, 2000);
  } catch {
    return "";
  }
}

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.IOT_WEBHOOK_SECRET;
  const webhookUrl = process.env.DEVICE_WEBHOOK_URL;

  if (!expectedSecret) {
    return NextResponse.json({ ok: false, message: "IOT_WEBHOOK_SECRET 환경변수가 설정되지 않았습니다." }, { status: 500 });
  }

  if (getRequestSecret(request) !== expectedSecret) {
    return NextResponse.json({ ok: false, message: "장비 제어 인증에 실패했습니다." }, { status: 401 });
  }

  let parsedBody: DeviceControlBody;
  try {
    parsedBody = (await request.json()) as DeviceControlBody;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON 요청 본문을 확인해주세요." }, { status: 400 });
  }

  const validation = validateBody(parsedBody);
  if (!validation.ok) {
    return NextResponse.json({ ok: false, message: validation.message }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { bayId, action, deviceType } = validation.data;
  const requestedAt = new Date().toISOString();
  const requestPayload = { bayId, action, deviceType, requestedAt };

  const { data: bay } = await supabase
    .from("bays")
    .select("id, store_id, bay_code")
    .eq("id", bayId)
    .maybeSingle();

  async function insertDeviceLog(status: DeviceLogStatus, responsePayload: Record<string, unknown>, errorMessage?: string) {
    const { error } = await supabase.from("device_logs").insert({
      bay_id: bay?.id ?? null,
      store_id: bay?.store_id ?? null,
      device_type: deviceType,
      action,
      status,
      request_payload: requestPayload,
      response_payload: responsePayload,
      error_message: errorMessage ?? null
    });

    return error;
  }

  if (!webhookUrl) {
    const logError = await insertDeviceLog("failed", { ok: false, reason: "missing_webhook_url" }, "DEVICE_WEBHOOK_URL 환경변수가 설정되지 않았습니다.");
    return NextResponse.json(
      {
        ok: false,
        message: "DEVICE_WEBHOOK_URL 환경변수가 설정되지 않았습니다.",
        logError: logError?.message ?? null
      },
      { status: 500 }
    );
  }

  try {
    const webhookResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-iot-webhook-secret": expectedSecret
      },
      body: JSON.stringify(requestPayload)
    });

    const responseBody = await readResponseBody(webhookResponse);
    const responsePayload = {
      ok: webhookResponse.ok,
      status: webhookResponse.status,
      body: responseBody
    };

    const logError = await insertDeviceLog(
      webhookResponse.ok ? "success" : "failed",
      responsePayload,
      webhookResponse.ok ? undefined : `외부 Webhook 응답 실패: ${webhookResponse.status}`
    );

    if (!webhookResponse.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: "외부 장비 Webhook 호출에 실패했습니다.",
          webhookStatus: webhookResponse.status,
          logError: logError?.message ?? null
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "장비 제어 신호를 전송했습니다.",
      bayId,
      action,
      deviceType,
      logError: logError?.message ?? null
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "알 수 없는 Webhook 호출 오류";
    const logError = await insertDeviceLog("failed", { ok: false, error: errorMessage }, errorMessage);

    return NextResponse.json(
      {
        ok: false,
        message: "장비 제어 처리 중 오류가 발생했습니다.",
        error: errorMessage,
        logError: logError?.message ?? null
      },
      { status: 500 }
    );
  }
}
