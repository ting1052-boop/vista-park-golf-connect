import { NextRequest, NextResponse } from "next/server";
import { getAgentByToken, getStoreExtensionSettings, touchAgent } from "@/lib/agent-server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type ActiveSessionRow = {
  id: string;
  guest_name: string | null;
  status: string;
  started_at: string | null;
  ends_at: string | null;
  reservation_id: string | null;
  reservations:
    | {
        guest_name: string | null;
        guest_phone_last4: string | null;
      }
    | Array<{
        guest_name: string | null;
        guest_phone_last4: string | null;
      }>
    | null;
};

type AgentCommandRow = {
  id: string;
  command_type: "shutdown_pc";
  payload: Record<string, unknown> | null;
  attempts: number;
};

async function claimShutdownCommand(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  agentId: string,
  bayId: string
) {
  const now = new Date();
  const nowIso = now.toISOString();
  const activeCommandCutoff = new Date(now.getTime() - 300_000).toISOString();
  const controllerId = `agent:${agentId}`;

  await supabase
    .from("store_controller_commands")
    .update({ status: "pending", controller_id: null, lease_expires_at: null })
    .eq("bay_id", bayId)
    .eq("command_type", "shutdown_pc")
    .eq("status", "processing")
    .lt("lease_expires_at", nowIso);

  await supabase
    .from("store_controller_commands")
    .update({
      status: "cancelled",
      completed_at: nowIso,
      lease_expires_at: null,
      error_message: "Agent가 유효시간 안에 받지 못해 종료 명령을 폐기했습니다."
    })
    .eq("bay_id", bayId)
    .eq("command_type", "shutdown_pc")
    .eq("status", "pending")
    .lt("created_at", activeCommandCutoff);

  const { data: pending, error: pendingError } = await supabase
    .from("store_controller_commands")
    .select("id, command_type, payload, attempts")
    .eq("bay_id", bayId)
    .eq("command_type", "shutdown_pc")
    .eq("status", "pending")
    .gte("created_at", activeCommandCutoff)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (pendingError) throw new Error(pendingError.message);
  if (!pending) return [];

  const command = pending as AgentCommandRow;
  const { data: claimed, error: claimError } = await supabase
    .from("store_controller_commands")
    .update({
      status: "processing",
      controller_id: controllerId,
      lease_expires_at: new Date(now.getTime() + 120_000).toISOString(),
      attempts: command.attempts + 1
    })
    .eq("id", command.id)
    .eq("status", "pending")
    .select("id, command_type, payload")
    .maybeSingle();

  if (claimError) throw new Error(claimError.message);
  if (!claimed) return [];

  return [{ id: claimed.id as string, type: "shutdown_pc" as const, payload: claimed.payload ?? {} }];
}

function getReservation(row: ActiveSessionRow) {
  return Array.isArray(row.reservations) ? row.reservations[0] : row.reservations;
}

function getCustomerLabel(row: ActiveSessionRow) {
  const reservation = getReservation(row);
  const name = row.guest_name ?? reservation?.guest_name ?? "이용 고객";
  const last4 = reservation?.guest_phone_last4;

  return last4 ? `${name} / ****-${last4}` : name;
}

export async function GET(request: NextRequest) {
  const supabase = createSupabaseAdminClient();
  const { agent, error: authError } = await getAgentByToken(supabase, request);

  if (!agent) {
    return NextResponse.json({ ok: false, message: authError ?? "Agent 인증에 실패했습니다." }, { status: 401 });
  }

  const agentVersion = request.headers.get("x-vista-agent-version");
  await touchAgent(supabase, agent, { agentVersion });

  let commands: Array<{ id: string; type: "shutdown_pc"; payload: Record<string, unknown> }> = [];
  try {
    commands = await claimShutdownCommand(supabase, agent.id, agent.bay_id);
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Agent 명령을 확인하지 못했습니다." },
      { status: 500 }
    );
  }

  const { data, error } = await supabase
    .from("access_sessions")
    .select("id, guest_name, status, started_at, ends_at, reservation_id, reservations(guest_name, guest_phone_last4)")
    .eq("bay_id", agent.bay_id)
    .in("status", ["active", "extended"])
    .not("ends_at", "is", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  const settings = await getStoreExtensionSettings(supabase, agent.store_id);

  if (!data) {
    return NextResponse.json({
      ok: true,
      session: null,
      policy: {
        warningBeforeMinutes: settings.extension_notice_minutes,
        criticalBeforeMinutes: settings.extension_deadline_minutes ?? 3,
        extensionMinutes: settings.extension_minutes,
        extensionPrice: settings.extension_price
      },
      commands
    });
  }

  const row = data as ActiveSessionRow;
  const now = new Date();
  const endsAt = row.ends_at ? new Date(row.ends_at) : null;
  const remainingSeconds = endsAt ? Math.max(0, Math.floor((endsAt.getTime() - now.getTime()) / 1000)) : null;

  return NextResponse.json({
    ok: true,
    session: {
      accessSessionId: row.id,
      customerLabel: getCustomerLabel(row),
      startsAt: row.started_at,
      endsAt: row.ends_at,
      status: row.status,
      remainingSeconds,
      reservationId: row.reservation_id
    },
    policy: {
      warningBeforeMinutes: settings.extension_notice_minutes,
      criticalBeforeMinutes: settings.extension_deadline_minutes ?? 3,
      extensionMinutes: settings.extension_minutes,
      extensionPrice: settings.extension_price
    },
    commands
  });
}
