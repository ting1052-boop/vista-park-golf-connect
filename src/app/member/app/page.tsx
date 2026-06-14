"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock,
  Loader2,
  MapPin,
  MonitorCog,
  Phone,
  ShieldAlert,
  Smartphone,
  Store,
  UserRound
} from "lucide-react";
import { SocialLoginPanel } from "@/components/social-login-panel";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const DEFAULT_STORE_ID = "11111111-1111-4111-8111-111111111111";
const timeSlots = ["09:30", "10:30", "11:30", "13:00", "14:00", "15:00", "16:00", "18:00", "19:00"];

type StoreRow = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  status: string | null;
};

type BayRow = {
  id: string;
  bay_code: string;
  display_name: string;
  status: string;
};

type ReservationRow = {
  id: string;
  starts_at: string;
  guest_name: string | null;
  party_size: number | null;
  status: string | null;
  approval_required: boolean | null;
  bays?: { bay_code?: string | null } | Array<{ bay_code?: string | null }> | null;
};

function getDateValue(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function getDateLabel(dateValue: string) {
  const today = getDateValue(0);
  const tomorrow = getDateValue(1);

  if (dateValue === today) return "오늘";
  if (dateValue === tomorrow) return "내일";

  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", weekday: "short" }).format(
    new Date(`${dateValue}T00:00:00`)
  );
}

function toReservationDate(dateValue: string, timeValue: string) {
  return new Date(`${dateValue}T${timeValue}:00`);
}

function isPastTimeSlot(dateValue: string, timeValue: string, now: Date) {
  return toReservationDate(dateValue, timeValue).getTime() <= now.getTime();
}

function getNextAvailableSelection(dateOptions: string[], now: Date) {
  for (const date of dateOptions) {
    const nextTime = timeSlots.find((time) => !isPastTimeSlot(date, time, now));

    if (nextTime) {
      return { date, time: nextTime };
    }
  }

  return { date: dateOptions[dateOptions.length - 1], time: timeSlots[0] };
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function maskPhone(phoneLast4: string) {
  return phoneLast4 ? `010-****-${phoneLast4}` : "전화번호 미입력";
}

function getBayCode(row: ReservationRow) {
  if (Array.isArray(row.bays)) {
    return row.bays[0]?.bay_code ?? "배정 예정";
  }

  return row.bays?.bay_code ?? "배정 예정";
}

function getStatusLabel(status: string | null | undefined, approvalRequired: boolean | null | undefined) {
  if (approvalRequired) return "승인 대기";
  if (status === "confirmed") return "예약 확정";
  if (status === "checked_in") return "입장 완료";
  if (status === "cancelled") return "취소";
  if (status === "no_show") return "노쇼";
  return "신청 완료";
}

export default function MemberAppPage() {
  const dateOptions = useMemo(() => [getDateValue(0), getDateValue(1), getDateValue(2)], []);
  const initialSelection = useMemo(() => getNextAvailableSelection(dateOptions, new Date()), [dateOptions]);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [bays, setBays] = useState<BayRow[]>([]);
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState(DEFAULT_STORE_ID);
  const [selectedBayId, setSelectedBayId] = useState("auto");
  const [selectedDate, setSelectedDate] = useState(initialSelection.date);
  const [selectedTime, setSelectedTime] = useState(initialSelection.time);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [partySize, setPartySize] = useState(2);
  const [customerName, setCustomerName] = useState("");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const selectedStore = stores.find((store) => store.id === selectedStoreId) ?? stores[0];
  const availableBays = bays.filter((bay) => bay.status === "available" || bay.status === "waiting");
  const approvalRequired = durationMinutes > 60 || partySize >= 5;
  const availableTimeSlots = useMemo(
    () => timeSlots.filter((time) => !isPastTimeSlot(selectedDate, time, now)),
    [now, selectedDate]
  );

  const loadData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const [storeResult, bayResult, reservationResult] = await Promise.all([
        supabase.from("stores").select("id, name, address, phone, status").order("name", { ascending: true }),
        supabase.from("bays").select("id, bay_code, display_name, status").order("bay_code", { ascending: true }),
        supabase
          .from("reservations")
          .select("id, starts_at, guest_name, party_size, status, approval_required, bays(bay_code)")
          .order("starts_at", { ascending: true })
          .limit(5)
      ]);

      if (storeResult.error) throw new Error(storeResult.error.message);
      if (bayResult.error) throw new Error(bayResult.error.message);
      if (reservationResult.error) throw new Error(reservationResult.error.message);

      const nextStores = (storeResult.data ?? []) as StoreRow[];
      setStores(nextStores);
      setBays((bayResult.data ?? []) as BayRow[]);
      setReservations((reservationResult.data ?? []) as ReservationRow[]);

      if (nextStores[0] && !nextStores.some((store) => store.id === selectedStoreId)) {
        setSelectedStoreId(nextStores[0].id);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "예약 정보를 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 30_000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (availableTimeSlots.includes(selectedTime)) return;

    if (availableTimeSlots[0]) {
      setSelectedTime(availableTimeSlots[0]);
      return;
    }

    const nextSelection = getNextAvailableSelection(dateOptions, now);
    setSelectedDate(nextSelection.date);
    setSelectedTime(nextSelection.time);
  }, [availableTimeSlots, dateOptions, now, selectedTime]);

  const submitReservation = async () => {
    setError(null);
    setMessage(null);

    if (!customerName.trim()) {
      setError("예약자 이름 또는 닉네임을 입력해주세요.");
      return;
    }

    if (!/^\d{4}$/.test(phoneLast4)) {
      setError("전화번호 뒤 4자리를 숫자로 입력해주세요.");
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const startsAt = toReservationDate(selectedDate, selectedTime);

      if (startsAt.getTime() <= Date.now()) {
        setError("이미 지난 시간은 예약할 수 없습니다. 가능한 시간을 다시 선택해주세요.");
        setIsLoading(false);
        return;
      }

      const endsAt = addMinutes(startsAt, durationMinutes);
      const selectedBay = selectedBayId === "auto" ? availableBays[0] : bays.find((bay) => bay.id === selectedBayId);

      const { error: insertError } = await supabase.from("reservations").insert({
        store_id: selectedStoreId,
        bay_id: selectedBay?.id ?? null,
        guest_name: `${customerName.trim()} / ${maskPhone(phoneLast4)}`,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        party_size: partySize,
        channel: "member_app",
        status: approvalRequired ? "requested" : "confirmed",
        approval_required: approvalRequired,
        memo: approvalRequired ? "고객 앱 예약, 매장 승인 필요" : "고객 앱 예약, 자동 확정"
      });

      if (insertError) {
        throw new Error(insertError.message);
      }

      setMessage(approvalRequired ? "예약 신청이 접수되었습니다. 매장 승인 후 확정됩니다." : "예약이 확정되었습니다.");
      setCustomerName("");
      setPhoneLast4("");
      setSelectedBayId("auto");
      await loadData();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "예약 신청에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#eef2ec] px-4 py-6 text-vista-ink">
      <div className="mx-auto max-w-md rounded-[28px] border border-[#d9e3d5] bg-white p-5 shadow-soft-line">
        <header className="flex items-center justify-between gap-3 border-b border-[#e5ece1] pb-4">
          <div>
            <p className="text-xs font-bold text-vista-leaf">VISTA Park Golf Connect</p>
            <h1 className="mt-1 text-2xl font-extrabold">회원 예약</h1>
          </div>
          <div className="grid size-12 place-items-center rounded-md bg-vista-leaf text-white">
            <Smartphone size={24} aria-hidden="true" />
          </div>
        </header>

        <section className="mt-5 rounded-md bg-vista-fairway p-4">
          <p className="text-sm font-bold text-[#697468]">모바일 예약</p>
          <h2 className="mt-1 text-xl font-extrabold">예약하면 매장 준비가 자동으로 시작됩니다</h2>
          <p className="mt-2 text-sm leading-6 text-[#697468]">
            예약 시간에 맞춰 매장 조명, 프로젝터, PC 전원 자동 준비를 연결하기 위한 고객 예약 화면입니다.
          </p>
        </section>

        <section className="mt-5">
          <div className="flex items-center gap-2">
            <Store className="text-vista-leaf" size={21} aria-hidden="true" />
            <h2 className="text-lg font-extrabold">예약 매장</h2>
          </div>

          <div className="mt-3 grid gap-3">
            {stores.length > 0 ? (
              stores.map((store) => (
                <button
                  key={store.id}
                  type="button"
                  onClick={() => setSelectedStoreId(store.id)}
                  className={`rounded-md border p-4 text-left transition ${
                    selectedStoreId === store.id ? "border-vista-leaf bg-vista-fairway" : "border-[#e5ece1] bg-white"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-md bg-white text-vista-leaf ring-1 ring-[#dfe8dc]">
                      <Store size={21} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-extrabold">{store.name}</h3>
                      <p className="mt-1 text-sm font-semibold text-[#697468]">{store.address ?? "주소 준비 중"}</p>
                      <p className="mt-2 text-xs font-bold text-vista-leaf">{store.phone ?? "매장 전화 준비 중"}</p>
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-md border border-[#e5ece1] p-4 text-sm font-bold text-[#697468]">
                매장 정보를 불러오는 중입니다.
              </div>
            )}
          </div>
        </section>

        <section className="mt-5 rounded-md border border-[#dfe8dc] p-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="text-vista-leaf" size={21} aria-hidden="true" />
            <h2 className="text-lg font-extrabold">예약 신청</h2>
          </div>

          <div className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm font-bold text-[#4f5b50]">
              예약자 이름
              <div className="flex items-center gap-2 rounded-md border border-[#cad8c6] bg-[#fbfcfa] px-3 py-3">
                <UserRound size={18} className="text-[#697468]" aria-hidden="true" />
                <input
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  className="w-full bg-transparent font-semibold outline-none"
                  placeholder="예: 홍길동"
                />
              </div>
            </label>

            <label className="grid gap-1 text-sm font-bold text-[#4f5b50]">
              전화번호 뒤 4자리
              <div className="flex items-center gap-2 rounded-md border border-[#cad8c6] bg-[#fbfcfa] px-3 py-3">
                <Phone size={18} className="text-[#697468]" aria-hidden="true" />
                <input
                  value={phoneLast4}
                  onChange={(event) => setPhoneLast4(event.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="w-full bg-transparent font-semibold outline-none"
                  inputMode="numeric"
                  placeholder="예: 1234"
                />
              </div>
            </label>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {dateOptions.map((date) => (
              <button
                key={date}
                type="button"
                onClick={() => setSelectedDate(date)}
                className={`rounded-md px-3 py-3 text-sm font-extrabold ${
                  selectedDate === date ? "bg-vista-leaf text-white" : "border border-[#cad8c6] bg-white"
                }`}
              >
                {getDateLabel(date)}
              </button>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {timeSlots.map((time) => {
              const isPast = isPastTimeSlot(selectedDate, time, now);

              return (
                <button
                  key={time}
                  type="button"
                  onClick={() => setSelectedTime(time)}
                  disabled={isPast}
                  aria-disabled={isPast}
                  className={`rounded-md px-3 py-3 text-sm font-extrabold ${
                    isPast
                      ? "cursor-not-allowed border border-[#d8ddd5] bg-[#f0f2ee] text-[#9aa39a] line-through"
                      : selectedTime === time
                        ? "bg-vista-night text-white"
                        : "border border-[#cad8c6] bg-white"
                  }`}
                >
                  {time}
                </button>
              );
            })}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            {[1, 2, 3, 4, 5, 6].map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => setPartySize(count)}
                className={`rounded-md px-3 py-3 text-sm font-extrabold ${
                  partySize === count ? "bg-vista-leaf text-white" : "border border-[#cad8c6] bg-white"
                }`}
              >
                {count}명
              </button>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {[60, 90, 120].map((minutes) => (
              <button
                key={minutes}
                type="button"
                onClick={() => setDurationMinutes(minutes)}
                className={`rounded-md px-3 py-3 text-sm font-extrabold ${
                  durationMinutes === minutes ? "bg-vista-night text-white" : "border border-[#cad8c6] bg-white"
                }`}
              >
                {minutes}분
              </button>
            ))}
          </div>

          <label className="mt-3 grid gap-1 text-sm font-bold text-[#4f5b50]">
            타석 선택
            <select
              value={selectedBayId}
              onChange={(event) => setSelectedBayId(event.target.value)}
              className="rounded-md border border-[#cad8c6] bg-[#fbfcfa] px-3 py-3 font-semibold outline-none focus:border-vista-leaf"
            >
              <option value="auto">자동 배정</option>
              {availableBays.map((bay) => (
                <option key={bay.id} value={bay.id}>
                  {bay.bay_code} · {bay.display_name}
                </option>
              ))}
            </select>
          </label>

          {approvalRequired ? (
            <p className="mt-3 rounded-md bg-[#fff9f0] px-3 py-2 text-xs font-bold leading-5 text-[#8a5a21]">
              90분 이상 또는 5명 이상 예약은 매장 승인 후 확정됩니다.
            </p>
          ) : (
            <p className="mt-3 rounded-md bg-[#edf6ef] px-3 py-2 text-xs font-bold leading-5 text-vista-leaf">
              현재 조건은 자동 확정 예약으로 접수됩니다.
            </p>
          )}

          {error ? (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">
              {error}
            </p>
          ) : null}

          {message ? (
            <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">
              {message}
            </p>
          ) : null}

          <button
            type="button"
            onClick={submitReservation}
            disabled={isLoading || !selectedStore}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-vista-leaf px-4 py-4 text-base font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? <Loader2 className="animate-spin" size={20} aria-hidden="true" /> : null}
            예약 신청
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </section>

        <section className="mt-5">
          <div className="flex items-center gap-2">
            <Clock className="text-vista-leaf" size={21} aria-hidden="true" />
            <h2 className="text-lg font-extrabold">최근 예약</h2>
          </div>
          <div className="mt-3 grid gap-3">
            {reservations.length > 0 ? (
              reservations.map((reservation) => (
                <article key={reservation.id} className="rounded-md border border-[#e5ece1] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-extrabold">
                        {new Intl.DateTimeFormat("ko-KR", {
                          month: "numeric",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
                        }).format(new Date(reservation.starts_at))}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-[#697468]">
                        {reservation.guest_name ?? "예약 고객"} · {reservation.party_size ?? 1}명
                      </p>
                    </div>
                    <span className="rounded-md bg-[#edf6ef] px-3 py-1 text-xs font-bold text-vista-leaf">
                      {getStatusLabel(reservation.status, reservation.approval_required)}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-bold text-[#4f5b50]">타석 {getBayCode(reservation)}</p>
                </article>
              ))
            ) : (
              <article className="rounded-md border border-[#e5ece1] p-4 text-sm font-bold text-[#697468]">
                아직 표시할 예약이 없습니다.
              </article>
            )}
          </div>
        </section>

        <SocialLoginPanel />

        <section className="mt-5 rounded-md border border-[#edd9c4] bg-[#fff9f0] p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 shrink-0 text-[#a15f1d]" size={21} aria-hidden="true" />
            <div>
              <h2 className="font-extrabold text-[#704514]">예약 안내</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#7a5b35]">
                방문이 어려운 경우 예약 시간 3시간 전까지 매장에 연락해주세요. 무단 불참이 반복되면 다음 예약이 매장 승인제로 전환될 수 있습니다.
              </p>
            </div>
          </div>
        </section>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <Link href="/member/scorecard" className="rounded-md border border-[#cad8c6] px-4 py-4 text-center text-sm font-extrabold">
            예약 내역
          </Link>
          <Link href="/admin/reservations" className="rounded-md border border-[#cad8c6] px-4 py-4 text-center text-sm font-extrabold">
            관리자 확인
          </Link>
        </div>

        <footer className="mt-5 grid grid-cols-4 gap-2 border-t border-[#e5ece1] pt-4 text-center text-xs font-bold text-[#697468]">
          <span>
            <MapPin className="mx-auto mb-1" size={18} aria-hidden="true" />
            매장
          </span>
          <span>
            <CalendarClock className="mx-auto mb-1" size={18} aria-hidden="true" />
            예약
          </span>
          <span>
            <MonitorCog className="mx-auto mb-1" size={18} aria-hidden="true" />
            타석
          </span>
          <span>
            <CheckCircle2 className="mx-auto mb-1" size={18} aria-hidden="true" />
            내역
          </span>
        </footer>
      </div>
    </main>
  );
}
