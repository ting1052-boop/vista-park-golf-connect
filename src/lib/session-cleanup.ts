import type { SupabaseClient } from "@supabase/supabase-js";
import { runBayAutomation } from "@/lib/automation/sessions";

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

export async function closeSingleSession(
  supabase: SupabaseClient,
  session: ExpiredAccessSession,
  completedAt = new Date().toISOString()
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

  if (session.bay_id) {
    const { error: bayError } = await supabase
      .from("bays")
      .update({ status: "available", updated_at: completedAt })
      .eq("id", session.bay_id);

    if (bayError) throw new Error(bayError.message);

    try {
      const automation = await runBayAutomation({
        supabase,
        bayId: session.bay_id,
        action: "exit",
        accessSessionId: session.id,
        reservationId: session.reservation_id
      });

      automationStatus = automation.steps.every((step) => step.ok) ? "requested" : "failed";
      message = automation.steps.map((step) => `${step.name}: ${step.ok ? "성공" : "실패"}`).join(", ");
    } catch (automationError) {
      automationStatus = "failed";
      message = automationError instanceof Error ? automationError.message : "종료 자동화 호출 실패";
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
