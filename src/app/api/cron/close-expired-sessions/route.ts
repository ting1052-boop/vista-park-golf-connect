import { NextRequest, NextResponse } from "next/server";
import { closeExpiredSessions } from "@/lib/session-cleanup";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

function getRequestSecret(request: NextRequest) {
  const headerSecret = request.headers.get("x-cron-secret");
  const authorization = request.headers.get("authorization");
  const bearerSecret = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : null;

  return headerSecret ?? bearerSecret;
}

export async function GET(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    return NextResponse.json({ ok: false, message: "CRON_SECRET 환경변수가 설정되지 않았습니다." }, { status: 500 });
  }

  if (getRequestSecret(request) !== expectedSecret) {
    return NextResponse.json({ ok: false, message: "Cron 인증에 실패했습니다." }, { status: 401 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const result = await closeExpiredSessions(supabase);

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "만료 세션 정리에 실패했습니다." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
