import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type LookupBody = {
  guestName?: unknown;
  phoneLast4?: unknown;
};

type ReservationRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string | null;
  approval_required: boolean | null;
  store_id: string;
  bay_id: string | null;
};

export async function POST(request: NextRequest) {
  let body: LookupBody;

  try {
    body = (await request.json()) as LookupBody;
  } catch {
    return NextResponse.json({ ok: false, message: "요청 내용을 확인해주세요." }, { status: 400 });
  }

  const guestName = typeof body.guestName === "string" ? body.guestName.trim() : "";
  const phoneLast4 = typeof body.phoneLast4 === "string" ? body.phoneLast4.trim() : "";

  if (guestName.length < 1) {
    return NextResponse.json({ ok: false, message: "예약자 이름을 입력해주세요." }, { status: 400 });
  }

  if (!/^\d{4}$/.test(phoneLast4)) {
    return NextResponse.json({ ok: false, message: "전화번호 뒤 4자리를 숫자로 입력해주세요." }, { status: 400 });
  }

  let supabase;
  try {
    supabase = createSupabaseAdminClient();
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "서버 설정 오류" },
      { status: 500 }
    );
  }

  const { data: reservations, error: reservationError } = await supabase
    .from("reservations")
    .select("id, starts_at, ends_at, status, approval_required, store_id, bay_id")
    .eq("guest_name", guestName)
    .eq("guest_phone_last4", phoneLast4)
    .order("starts_at", { ascending: false })
    .limit(20);

  if (reservationError) {
    return NextResponse.json({ ok: false, message: reservationError.message }, { status: 500 });
  }

  const rows = (reservations ?? []) as ReservationRow[];
  const storeIds = Array.from(new Set(rows.map((row) => row.store_id)));
  const bayIds = Array.from(new Set(rows.map((row) => row.bay_id).filter(Boolean))) as string[];

  const [storeResult, bayResult] = await Promise.all([
    storeIds.length > 0
      ? supabase.from("stores").select("id, name, address, phone").in("id", storeIds)
      : Promise.resolve({ data: [], error: null }),
    bayIds.length > 0
      ? supabase.from("bays").select("id, bay_code, display_name").in("id", bayIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (storeResult.error) {
    return NextResponse.json({ ok: false, message: storeResult.error.message }, { status: 500 });
  }

  if (bayResult.error) {
    return NextResponse.json({ ok: false, message: bayResult.error.message }, { status: 500 });
  }

  const stores = new Map((storeResult.data ?? []).map((store) => [store.id, store]));
  const bays = new Map((bayResult.data ?? []).map((bay) => [bay.id, bay]));

  return NextResponse.json({
    ok: true,
    reservations: rows.map((row) => {
      const store = stores.get(row.store_id);
      const bay = row.bay_id ? bays.get(row.bay_id) : null;

      return {
        id: row.id,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        status: row.status,
        approvalRequired: row.approval_required,
        storeName: store?.name ?? "매장 정보 준비 중",
        storeAddress: store?.address ?? null,
        storePhone: store?.phone ?? null,
        bayLabel: bay ? `${bay.bay_code} · ${bay.display_name}` : "자동 배정"
      };
    })
  });
}
