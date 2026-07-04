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
      }
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
    commands: []
  });
}
