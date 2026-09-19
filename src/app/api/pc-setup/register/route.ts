import { NextRequest, NextResponse } from "next/server";
import { getBearerToken } from "@/lib/agent-server";
import { parseRegisterPayload, redactForLog } from "@/lib/pc-registry-payload";
import { registerBayPc, resolveRegisterAuth } from "@/lib/pc-registry";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

// 세팅 도구가 보내는 등록 요청은 크지 않다. 큰 본문은 읽기 전에 자른다.
const MAX_BODY_BYTES = 8 * 1024;

function error(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, code, message, ...extra }, { status });
}

export async function POST(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) {
    return error(401, "unauthorized", "등록 토큰이 필요합니다.");
  }

  let supabase;
  try {
    supabase = createSupabaseAdminClient();
  } catch (caught) {
    return error(500, "server_error", caught instanceof Error ? caught.message : "서버 설정 오류");
  }

  const auth = await resolveRegisterAuth(supabase, token);
  if (!auth) {
    return error(401, "unauthorized", "등록 토큰이 올바르지 않습니다.");
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
      return error(413, "payload_too_large", "요청 본문이 너무 큽니다.");
    }
    body = JSON.parse(raw);
  } catch {
    return error(400, "invalid_payload", "JSON 요청 본문을 확인해주세요.");
  }

  const parsed = parseRegisterPayload(body);
  if (!parsed.ok) {
    return error(400, parsed.error.code, parsed.error.message, { field: parsed.error.field });
  }

  try {
    const outcome = await registerBayPc(supabase, parsed.payload, auth);

    if (!outcome.ok) {
      return error(outcome.error.status, outcome.error.code, outcome.error.message, {
        conflict: outcome.error.conflict ?? null
      });
    }

    return NextResponse.json({ ok: true, ...outcome.result });
  } catch (caught) {
    // 본문과 Authorization 헤더는 절대 로그로 내보내지 않는다.
    console.error("pc-setup register failed", {
      ...redactForLog(parsed.payload),
      reason: caught instanceof Error ? caught.message : "unknown"
    });
    return error(500, "server_error", "등록 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
  }
}
