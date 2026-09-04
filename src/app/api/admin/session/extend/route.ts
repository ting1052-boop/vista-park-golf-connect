import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

// 관리자가 이용 중인 타석의 종료 시각을 실제로 조정한다.
// 예전에는 대시보드가 화면 숫자만 바꾸고 DB를 건드리지 않아, 새로고침하면
// 원래 시간으로 돌아갔다. 예약(reservations)과 이용 세션(access_sessions)의
// 종료 시각을 함께 옮겨 다음 예약과의 겹침도 DB 배타 제약으로 검증한다.

type ExtendBody = {
  accessSessionId?: unknown;
  bayId?: unknown;
  minutes?: unknown;
};

type ActiveSessionRow = {
  id: string;
  store_id: string;
  reservation_id: string | null;
  bay_id: string | null;
  started_at: string | null;
  ends_at: string | null;
  status: string;
};

const SESSION_COLUMNS = "id, store_id, reservation_id, bay_id, started_at, ends_at, status";
const ACTIVE_STATUSES = ["active", "extended", "overdue"];

// 실수로 큰 값을 넣어 하루를 통째로 잡아버리는 것을 막는다.
const MIN_ADJUST_MINUTES = -240;
const MAX_ADJUST_MINUTES = 240;
const MIN_SESSION_MINUTES = 5;

export async function POST(request: NextRequest) {
  try {
    await requireAdminUser();
  } catch {
    return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  let body: ExtendBody;
  try {
    body = (await request.json()) as ExtendBody;
  } catch {
    return NextResponse.json({ ok: false, message: "요청 내용을 확인해 주세요." }, { status: 400 });
  }

  const minutes = Number(body.minutes);
  if (!Number.isInteger(minutes) || minutes === 0) {
    return NextResponse.json({ ok: false, message: "조정할 시간을 분 단위로 입력해주세요." }, { status: 400 });
  }
  if (minutes < MIN_ADJUST_MINUTES || minutes > MAX_ADJUST_MINUTES) {
    return NextResponse.json(
      { ok: false, message: `한 번에 조정할 수 있는 시간은 ${MAX_ADJUST_MINUTES}분까지입니다.` },
      { status: 400 }
    );
  }

  try {
    const supabase = createSupabaseAdminClient();

    let query = supabase.from("access_sessions").select(SESSION_COLUMNS).in("status", ACTIVE_STATUSES);
    if (typeof body.accessSessionId === "string" && body.accessSessionId.length > 0) {
      query = query.eq("id", body.accessSessionId);
    } else if (typeof body.bayId === "string" && body.bayId.length > 0) {
      query = query.eq("bay_id", body.bayId);
    } else {
      return NextResponse.json({ ok: false, message: "조정할 타석을 선택해주세요." }, { status: 400 });
    }

    const { data, error } = await query.order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(error.message);

    const session = (data as ActiveSessionRow | null) ?? null;
    if (!session) {
      return NextResponse.json(
        { ok: false, message: "이용 중인 세션이 없습니다. 먼저 입장 처리를 해주세요." },
        { status: 404 }
      );
    }
    if (!session.ends_at) {
      return NextResponse.json({ ok: false, message: "세션 종료 시각이 없어 조정할 수 없습니다." }, { status: 409 });
    }

    const currentEndsAt = new Date(session.ends_at);
    const nextEndsAt = new Date(currentEndsAt.getTime() + minutes * 60_000);
    const startedAt = session.started_at ? new Date(session.started_at) : null;

    // 줄이는 경우, 이미 지난 시각이나 시작 직후로 당기면 곧바로 종료돼 버린다.
    const floor = new Date(Math.max(Date.now(), startedAt ? startedAt.getTime() : 0) + MIN_SESSION_MINUTES * 60_000);
    if (nextEndsAt < floor) {
      return NextResponse.json(
        { ok: false, message: `지금부터 최소 ${MIN_SESSION_MINUTES}분은 남아 있어야 합니다.` },
        { status: 400 }
      );
    }

    const nextEndsAtIso = nextEndsAt.toISOString();
    const nowIso = new Date().toISOString();

    // 예약을 먼저 옮긴다. 다음 예약과 겹치면 여기서 배타 제약(23P01)이 걸린다.
    if (session.reservation_id) {
      const { error: reservationError } = await supabase
        .from("reservations")
        .update({ ends_at: nextEndsAtIso, updated_at: nowIso })
        .eq("id", session.reservation_id);

      if (reservationError) {
        if (reservationError.code === "23P01") {
          return NextResponse.json(
            { ok: false, message: "다음 예약 시간과 겹쳐서 연장할 수 없습니다. 예약을 먼저 확인해주세요." },
            { status: 409 }
          );
        }
        throw new Error(reservationError.message);
      }
    }

    const { error: sessionError } = await supabase
      .from("access_sessions")
      .update({ ends_at: nextEndsAtIso, status: "extended", updated_at: nowIso })
      .eq("id", session.id);

    if (sessionError) {
      // 세션 갱신이 실패하면 예약만 옮겨진 상태가 되므로 되돌린다.
      if (session.reservation_id) {
        await supabase
          .from("reservations")
          .update({ ends_at: session.ends_at, updated_at: nowIso })
          .eq("id", session.reservation_id);
      }
      throw new Error(sessionError.message);
    }

    // 타석 PC 에이전트는 주기적으로 세션을 조회하므로 곧 새 시간을 받아간다.
    const remainingMinutes = Math.max(0, Math.round((nextEndsAt.getTime() - Date.now()) / 60_000));

    return NextResponse.json({
      ok: true,
      accessSessionId: session.id,
      bayId: session.bay_id,
      endsAt: nextEndsAtIso,
      remainingMinutes,
      message:
        minutes > 0
          ? `이용시간을 ${minutes}분 연장했습니다.`
          : `이용시간을 ${Math.abs(minutes)}분 단축했습니다.`
    });
  } catch (caught) {
    return NextResponse.json(
      { ok: false, message: caught instanceof Error ? caught.message : "이용시간 조정에 실패했습니다." },
      { status: 500 }
    );
  }
}
