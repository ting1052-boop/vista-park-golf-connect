import type { SupabaseClient } from "@supabase/supabase-js";
import { runBayAutomation } from "@/lib/automation/sessions";
import { enqueueBayRelease, isStoreControllerEnabled } from "@/lib/store-controller";

type ExpiredAccessSession = {
  id: string;
  store_id: string;
  reservation_id: string | null;
  bay_id: string | null;
  ends_at: string | null;
};

export type CloseSingleSessionResult = {
  accessSessionId: string;
  bayId: string | null;
  status: "completed" | "not_found";
  automationStatus: "requested" | "failed" | "skipped";
  message: string | null;
};

export type SessionCleanupResult = {
  scanned: number;
  completed: number;
  failed: number;
  items: Array<{
    accessSessionId: string;
    bayId: string | null;
    status: "completed" | "failed";
    automationStatus: "requested" | "failed" | "skipped";
    message: string | null;
  }>;
};

const EXPIRING_SESSION_STATUSES = ["active", "extended", "overdue"] as const;

async function findOtherActiveSession(supabase: SupabaseClient, bayId: string, accessSessionId: string) {
  const { data, error } = await supabase
    .from("access_sessions")
    .select("id")
    .eq("bay_id", bayId)
    .neq("id", accessSessionId)
    .in("status", [...EXPIRING_SESSION_STATUSES])
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

export async function closeSingleSession(
  supabase: SupabaseClient,
  session: ExpiredAccessSession,
  completedAt = new Date().toISOString(),
  options: { runAutomation?: boolean } = {}
): Promise<CloseSingleSessionResult> {
  let automationStatus: CloseSingleSessionResult["automationStatus"] = "skipped";
  let message: string | null = null;

  const { data: updatedSessions, error: sessionError } = await supabase
    .from("access_sessions")
    .update({ status: "completed", completed_at: completedAt, updated_at: completedAt })
    .eq("id", session.id)
    .in("status", [...EXPIRING_SESSION_STATUSES])
    .select("id");

  if (sessionError) throw new Error(sessionError.message);

  if (!updatedSessions || updatedSessions.length === 0) {
    return {
      accessSessionId: session.id,
      bayId: session.bay_id,
      status: "not_found",
      automationStatus: "skipped",
      message: "이미 종료되었거나 활성 상태가 아닌 세션입니다."
    };
  }

  await supabase
    .from("kiosk_sessions")
    .update({ remaining_seconds: 0, is_locked: true, locked_at: completedAt, updated_at: completedAt })
    .eq("access_session_id", session.id);

  // 세션을 닫으면 연결된 예약도 종료 처리한다. 그러지 않으면 예약이 checked_in +
  // 미래 종료시각으로 남아, 키오스크 가용성 조회와 DB 겹침방지 제약이 그 타석을
  // 계속 "이용 중/예약됨"으로 막아 재입장이 안 된다. ends_at을 지금으로 당겨
  // 겹침을 해소하고 status를 completed로 표시한다.
  if (session.reservation_id) {
    await supabase
      .from("reservations")
      .update({ status: "completed", ends_at: completedAt, updated_at: completedAt })
      .eq("id", session.reservation_id)
      .in("status", ["requested", "confirmed", "checked_in"]);
  }

  if (session.bay_id) {
    const existingActiveSessionId = await findOtherActiveSession(supabase, session.bay_id, session.id);
    if (existingActiveSessionId) {
      return {
        accessSessionId: session.id,
        bayId: session.bay_id,
        status: "completed",
        automationStatus: "skipped",
        message: "같은 타석의 다른 이용 세션이 진행 중이어서 타석 반납과 장비 OFF를 건너뛰었습니다."
      };
    }

    const { error: bayError } = await supabase
      .from("bays")
      .update({ status: "available", updated_at: completedAt })
      .eq("id", session.bay_id);

    if (bayError) {
      const { error: restoreError } = await supabase
        .from("access_sessions")
        .update({ status: "overdue", completed_at: null, updated_at: completedAt })
        .eq("id", session.id)
        .eq("status", "completed");

      if (restoreError) {
        throw new Error(`${bayError.message} (종료 세션 복구 실패: ${restoreError.message})`);
      }

      throw new Error(`${bayError.message} (세션을 종료 지연 상태로 복구했습니다.)`);
    }

    const racedActiveSessionId = await findOtherActiveSession(supabase, session.bay_id, session.id);
    if (racedActiveSessionId) {
      const { error: restoreBayError } = await supabase
        .from("bays")
        .update({ status: "in_use", updated_at: completedAt })
        .eq("id", session.bay_id);

      if (restoreBayError) throw new Error(restoreBayError.message);

      return {
        accessSessionId: session.id,
        bayId: session.bay_id,
        status: "completed",
        automationStatus: "skipped",
        message: "종료 처리 중 새 이용 세션이 확인되어 타석을 이용 중으로 유지했습니다."
      };
    }

    if (options.runAutomation !== false) {
      try {
        if (isStoreControllerEnabled()) {
          const queued = await enqueueBayRelease(supabase, {
            bayId: session.bay_id,
            accessSessionId: session.id,
            reservationId: session.reservation_id
          });
          automationStatus = "requested";
          message = `매장 제어기 종료 명령을 등록했습니다. (${queued.status})`;
        } else {
          const automation = await runBayAutomation({
            supabase,
            bayId: session.bay_id,
            action: "exit",
            accessSessionId: session.id,
            reservationId: session.reservation_id
          });

          automationStatus = automation.steps.every((step) => step.ok) ? "requested" : "failed";
          message = automation.steps.map((step) => `${step.name}: ${step.ok ? "성공" : "실패"}`).join(", ");
        }
      } catch (automationError) {
        automationStatus = "failed";
        message = automationError instanceof Error ? automationError.message : "종료 자동화 호출 실패";
      }
    }
  }

  return {
    accessSessionId: session.id,
    bayId: session.bay_id,
    status: "completed",
    automationStatus,
    message
  };
}

export async function closeExpiredSessions(
  supabase: SupabaseClient,
  now = new Date()
): Promise<SessionCleanupResult> {
  const { data, error } = await supabase
    .from("access_sessions")
    .select("id, store_id, reservation_id, bay_id, ends_at")
    .in("status", [...EXPIRING_SESSION_STATUSES])
    .not("ends_at", "is", null)
    .lte("ends_at", now.toISOString())
    .order("ends_at", { ascending: true })
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }

  const sessions = (data ?? []) as ExpiredAccessSession[];
  const result: SessionCleanupResult = {
    scanned: sessions.length,
    completed: 0,
    failed: 0,
    items: []
  };

  for (const session of sessions) {
    try {
      const closed = await closeSingleSession(supabase, session);

      result.completed += 1;
      result.items.push({
        accessSessionId: session.id,
        bayId: session.bay_id,
        status: "completed",
        automationStatus: closed.automationStatus,
        message: closed.message
      });
    } catch (caughtError) {
      result.failed += 1;
      result.items.push({
        accessSessionId: session.id,
        bayId: session.bay_id,
        status: "failed",
        automationStatus: "skipped",
        message: caughtError instanceof Error ? caughtError.message : "세션 종료 처리 실패"
      });
    }
  }

  return result;
}
