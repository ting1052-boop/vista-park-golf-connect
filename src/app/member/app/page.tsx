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
import { PwaInstallCard } from "@/components/pwa-install-card";
import { SocialLoginPanel } from "@/components/social-login-panel";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { toReservationErrorMessage } from "@/lib/supabase/reservation-errors";

const DEFAULT_STORE_ID = "11111111-1111-4111-8111-111111111111";
const STORE_TIME_ZONE = "Asia/Seoul";
const timeSlots = ["09:30", "10:30", "11:30", "13:00", "14:00", "15:00", "16:00", "18:00", "19:00"];
const durationOptions = [
  { minutes: 30, price: 6000, bonusMinutes: 0 },
  { minutes: 60, price: 10000, bonusMinutes: 10 },
  { minutes: 90, price: 16000, bonusMinutes: 0 },
  { minutes: 120, price: 20000, bonusMinutes: 0 }
] as const;

const priceByDuration = Object.fromEntries(durationOptions.map((option) => [option.minutes, option.price])) as Record<number, number>;
const bonusMinutesByDuration = Object.fromEntries(durationOptions.map((option) => [option.minutes, option.bonusMinutes])) as Record<
  number,
  number
>;

type StoreRow = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  status: string | null;
};

type BayRow = {
  id: string;
  store_id: string;
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

type ActiveReservationRow = {
  bay_id: string | null;
  starts_at: string;
  ends_at: string;
  status: string | null;
};

const INACTIVE_RESERVATION_STATUSES = ["cancelled", "no_show"];

function getSeoulDateValue(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STORE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function getDateValue(offsetDays: number, baseDate = new Date()) {
  const [year, month, day] = getSeoulDateValue(baseDate).split("-").map(Number);
  const seoulNoon = new Date(Date.UTC(year, month - 1, day + offsetDays, 12));

  return getSeoulDateValue(seoulNoon);
}

function getDateOptions(now: Date) {
  return [getDateValue(0, now), getDateValue(1, now), getDateValue(2, now)];
}

function getDateLabel(dateValue: string, now: Date) {
  const today = getDateValue(0, now);
  const tomorrow = getDateValue(1, now);

  if (dateValue === today) return "오늘";
  if (dateValue === tomorrow) return "내일";

  const [year, month, day] = dateValue.split("-").map(Number);

  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", weekday: "short" }).format(
    new Date(Date.UTC(year, month - 1, day, 12))
  );
}

function toReservationDate(dateValue: string, timeValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);

  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute));
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

function getBonusMinutes(durationMinutes: number) {
  return bonusMinutesByDuration[durationMinutes] ?? 0;
}

function getReservedMinutes(durationMinutes: number) {
  return durationMinutes + getBonusMinutes(durationMinutes);
}

function formatDurationLabel(durationMinutes: number) {
  const bonusMinutes = getBonusMinutes(durationMinutes);

  return bonusMinutes > 0 ? `${durationMinutes}분 + ${bonusMinutes}분` : `${durationMinutes}분`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 }).format(value);
}

function formatReservationDate(dateValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);

  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
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
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [bays, setBays] = useState<BayRow[]>([]);
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [activeReservations, setActiveReservations] = useState<ActiveReservationRow[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState(DEFAULT_STORE_ID);
  const [selectedBayId, setSelectedBayId] = useState("auto");
  const [selectedDate, setSelectedDate] = useState(() => getNextAvailableSelection(getDateOptions(new Date()), new Date()).date);
  const [selectedTime, setSelectedTime] = useState(() => getNextAvailableSelection(getDateOptions(new Date()), new Date()).time);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [partySize, setPartySize] = useState(2);
  const [customerName, setCustomerName] = useState("");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const dateOptions = useMemo(() => getDateOptions(now), [now]);

  const selectedStore = stores.find((store) => store.id === selectedStoreId) ?? stores[0];
  const selectedStoreBays = bays.filter((bay) => bay.store_id === selectedStoreId);
  const approvalRequired = durationMinutes > 60 || partySize >= 5;
  const reservedMinutes = getReservedMinutes(durationMinutes);
  const bonusMinutes = getBonusMinutes(durationMinutes);
  const previewStartsAt = useMemo(() => toReservationDate(selectedDate, selectedTime), [selectedDate, selectedTime]);
  const previewEndsAt = useMemo(
    () => addMinutes(previewStartsAt, reservedMinutes),
    [previewStartsAt, reservedMinutes]
  );

  const getBlockedBayIds = (startsAt: Date, endsAt: Date) => {
    const blocked = new Set<string>();
    const previewStart = startsAt.getTime();
    const previewEnd = endsAt.getTime();

    for (const reservation of activeReservations) {
      if (!reservation.bay_id) continue;
      if (INACTIVE_RESERVATION_STATUSES.includes(reservation.status ?? "")) continue;

      const existingStart = new Date(reservation.starts_at).getTime();
      const existingEnd = new Date(reservation.ends_at).getTime();

      if (previewStart < existingEnd && existingStart < previewEnd) {
        blocked.add(reservation.bay_id);
      }
    }

    return blocked;
  };

  const timeSlotStates = useMemo(
    () =>
      timeSlots.map((time) => {
        const startsAt = toReservationDate(selectedDate, time);
        const endsAt = addMinutes(startsAt, reservedMinutes);
        const blockedBayIds = getBlockedBayIds(startsAt, endsAt);
        const availableCount = selectedStoreBays.filter(
          (bay) => (bay.status === "available" || bay.status === "waiting") && !blockedBayIds.has(bay.id)
        ).length;

        return {
          time,
          isPast: startsAt.getTime() <= now.getTime(),
          isSoldOut: availableCount === 0,
          availableCount
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeReservations, now, reservedMinutes, selectedDate, selectedStoreBays]
  );

  const availableTimeSlots = useMemo(
    () => timeSlotStates.filter((slot) => !slot.isPast && !slot.isSoldOut).map((slot) => slot.time),
    [timeSlotStates]
  );

  const blockedBayIds = useMemo(
    () => getBlockedBayIds(previewStartsAt, previewEndsAt),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeReservations, previewEndsAt, previewStartsAt]
  );

  const availableBays = selectedStoreBays.filter(
    (bay) => (bay.status === "available" || bay.status === "waiting") && !blockedBayIds.has(bay.id)
  );
  const selectedBay = selectedBayId === "auto" ? availableBays[0] : availableBays.find((bay) => bay.id === selectedBayId);
  const estimatedPrice = priceByDuration[durationMinutes] ?? Math.round((durationMinutes / 30) * priceByDuration[30]);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const range = getDateOptions(new Date());
      const rangeStart = toReservationDate(range[0], "00:00");
      const rangeEnd = addMinutes(toReservationDate(range[range.length - 1], "23:59"), 120);

      const [storeResult, bayResult, reservationResult, activeReservationResult] = await Promise.all([
        supabase.from("stores").select("id, name, address, phone, status").order("name", { ascending: true }),
        supabase.from("bays").select("id, store_id, bay_code, display_name, status").order("bay_code", { ascending: true }),
        supabase
          .from("reservations")
          .select("id, starts_at, guest_name, party_size, status, approval_required, bays(bay_code)")
          .order("starts_at", { ascending: true })
          .limit(5),
        supabase
          .from("reservations")
          .select("bay_id, starts_at, ends_at, status")
          .gte("starts_at", rangeStart.toISOString())
          .lte("starts_at", rangeEnd.toISOString())
      ]);

      if (storeResult.error) throw new Error(storeResult.error.message);
      if (bayResult.error) throw new Error(bayResult.error.message);
      if (reservationResult.error) throw new Error(reservationResult.error.message);
      if (activeReservationResult.error) throw new Error(activeReservationResult.error.message);

      const nextStores = (storeResult.data ?? []) as StoreRow[];
      setStores(nextStores);
      setBays((bayResult.data ?? []) as BayRow[]);
      setReservations((reservationResult.data ?? []) as ReservationRow[]);
      setActiveReservations((activeReservationResult.data ?? []) as ActiveReservationRow[]);

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

    if (!dateOptions.includes(selectedDate)) {
      const nextSelection = getNextAvailableSelection(dateOptions, now);
      setSelectedDate(nextSelection.date);
      setSelectedTime(nextSelection.time);
      return;
    }

    if (availableTimeSlots[0]) {
      setSelectedTime(availableTimeSlots[0]);
      return;
    }

    const nextSelection = getNextAvailableSelection(dateOptions, now);
    setSelectedDate(nextSelection.date);
    setSelectedTime(nextSelection.time);
  }, [availableTimeSlots, dateOptions, now, selectedDate, selectedTime]);

  useEffect(() => {
    if (selectedBayId === "auto") return;
    if (availableBays.some((bay) => bay.id === selectedBayId)) return;

    setSelectedBayId("auto");
  }, [availableBays, selectedBayId]);

  useEffect(() => {
    setIsReviewing(false);
  }, [customerName, durationMinutes, partySize, phoneLast4, selectedBayId, selectedDate, selectedStoreId, selectedTime]);

  const validateReservationInput = () => {
    setError(null);
    setMessage(null);

    if (!customerName.trim()) {
      setError("예약자 이름 또는 닉네임을 입력해주세요.");
      return false;
    }

    if (!/^\d{4}$/.test(phoneLast4)) {
      setError("전화번호 뒤 4자리를 숫자로 입력해주세요.");
      return false;
    }

    if (!selectedStore) {
      setError("예약할 매장을 선택해주세요.");
      return false;
    }

    if (previewStartsAt.getTime() <= Date.now()) {
      setError("이미 지난 시간은 예약할 수 없습니다. 가능한 시간을 다시 선택해주세요.");
      return false;
    }

    if (!selectedBay) {
      setError("선택하신 시간에 예약 가능한 타석이 없습니다. 다른 시간을 선택해주세요.");
      return false;
    }

    return true;
  };

  const handlePrimaryAction = () => {
    if (!isReviewing) {
      if (validateReservationInput()) {
        setIsReviewing(true);
      }

      return;
    }

    void submitReservation();
  };

  const submitReservation = async () => {
    if (!validateReservationInput()) {
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

      const endsAt = addMinutes(startsAt, reservedMinutes);
      const selectedBay = selectedBayId === "auto" ? availableBays[0] : bays.find((bay) => bay.id === selectedBayId);

      if (!selectedBay) {
        setError("선택하신 시간에 예약 가능한 타석이 없습니다. 다른 시간을 선택해주세요.");
        setIsLoading(false);
        return;
      }

      const { data: conflictRows, error: conflictError } = await supabase
        .from("reservations")
        .select("id")
        .eq("bay_id", selectedBay.id)
        .not("status", "in", `(${INACTIVE_RESERVATION_STATUSES.join(",")})`)
        .lt("starts_at", endsAt.toISOString())
        .gt("ends_at", startsAt.toISOString());

      if (conflictError) throw new Error(conflictError.message);

      if (conflictRows && conflictRows.length > 0) {
        setError("방금 다른 예약이 접수되어 선택하신 타석·시간이 마감되었습니다. 다시 선택해주세요.");
        await loadData();
        setIsLoading(false);
        return;
      }

      const { error: insertError } = await supabase.from("reservations").insert({
        store_id: selectedStoreId,
        bay_id: selectedBay.id,
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
        if (insertError.code === "23P01") {
          setError(toReservationErrorMessage(insertError));
          await loadData();
          setIsLoading(false);
          return;
        }

        throw new Error(insertError.message);
      }

      setMessage(approvalRequired ? "예약 신청이 접수되었습니다. 매장 승인 후 확정됩니다." : "예약이 확정되었습니다.");
      setCustomerName("");
      setPhoneLast4("");
      setSelectedBayId("auto");
      setIsReviewing(false);
      await loadData();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "예약 신청에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#eef2ec] px-4 pb-28 pt-6 text-vista-ink">
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

        <PwaInstallCard />

        <section className="mt-5">
          <div className="flex items-center gap-2">
            <Store className="text-vista-leaf" size={21} aria-hidden="true" />
            <h2 className="text-lg font-extrabold">1. 예약 매장</h2>
          </div>

          <div className="mt-3 rounded-md border border-[#dfe8dc] bg-white p-4">
            <label className="grid gap-2 text-sm font-bold text-[#4f5b50]">
              매장 선택
              <select
                value={selectedStoreId}
                onChange={(event) => setSelectedStoreId(event.target.value)}
                disabled={stores.length === 0 || isLoading}
                className="rounded-md border border-[#cad8c6] bg-[#fbfcfa] px-3 py-4 text-base font-extrabold outline-none focus:border-vista-leaf disabled:cursor-not-allowed disabled:opacity-60"
              >
                {stores.length > 0 ? (
                  stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))
                ) : (
                  <option>매장 정보를 불러오는 중입니다</option>
                )}
              </select>
            </label>

            <div className="mt-3 flex items-start gap-3 rounded-md bg-vista-fairway p-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-md bg-white text-vista-leaf ring-1 ring-[#dfe8dc]">
                <Store size={20} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-extrabold">{selectedStore?.name ?? "매장 선택 대기"}</h3>
                <p className="mt-1 text-sm font-semibold text-[#697468]">{selectedStore?.address ?? "주소 준비 중"}</p>
                <p className="mt-2 text-xs font-bold text-vista-leaf">{selectedStore?.phone ?? "매장 전화 준비 중"}</p>
                <p className="mt-1 text-xs font-bold text-[#4f5b50]">운영시간 09:30 ~ 21:00</p>
                <p className="mt-2 text-xs font-bold text-[#4f5b50]">예약 가능 타석 {availableBays.length}개</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-md border border-[#dfe8dc] p-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="text-vista-leaf" size={21} aria-hidden="true" />
            <h2 className="text-lg font-extrabold">2. 예약자 정보</h2>
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

          <div className="mt-5 flex items-center gap-2 border-t border-[#e5ece1] pt-4">
            <CalendarClock className="text-vista-leaf" size={21} aria-hidden="true" />
            <h2 className="text-lg font-extrabold">3. 날짜와 시간</h2>
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
                {getDateLabel(date, now)}
              </button>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {timeSlotStates.map((slot) => {
              const isDisabled = slot.isPast || slot.isSoldOut;

              return (
                <button
                  key={slot.time}
                  type="button"
                  onClick={() => setSelectedTime(slot.time)}
                  disabled={isDisabled}
                  aria-disabled={isDisabled}
                  className={`min-h-[54px] rounded-md px-3 py-2 text-sm font-extrabold ${
                    isDisabled
                      ? "cursor-not-allowed border border-[#d8ddd5] bg-[#f0f2ee] text-[#9aa39a] line-through"
                      : selectedTime === slot.time
                        ? "bg-vista-night text-white"
                        : "border border-[#cad8c6] bg-white"
                  }`}
                >
                  <span className="block">{slot.time}</span>
                  {slot.isSoldOut && !slot.isPast ? <span className="mt-0.5 block text-[11px] no-underline">마감</span> : null}
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex items-center gap-2 border-t border-[#e5ece1] pt-4">
            <UserRound className="text-vista-leaf" size={21} aria-hidden="true" />
            <h2 className="text-lg font-extrabold">4. 인원과 이용시간</h2>
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

          <div className="mt-3 grid grid-cols-2 gap-2">
            {durationOptions.map((option) => (
              <button
                key={option.minutes}
                type="button"
                onClick={() => setDurationMinutes(option.minutes)}
                className={`min-h-[68px] rounded-md px-3 py-3 text-sm font-extrabold ${
                  durationMinutes === option.minutes ? "bg-vista-night text-white" : "border border-[#cad8c6] bg-white"
                }`}
              >
                <span className="block">{formatDurationLabel(option.minutes)}</span>
                <span className={`mt-1 block text-xs ${durationMinutes === option.minutes ? "text-white/80" : "text-[#697468]"}`}>
                  {formatCurrency(option.price)}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-3 rounded-md bg-[#fbfcfa] p-3 ring-1 ring-[#e5ece1]">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-extrabold">예상 이용요금</p>
              <strong className="text-lg text-vista-leaf">{formatCurrency(estimatedPrice)}</strong>
            </div>
            <p className="mt-1 text-xs font-semibold leading-5 text-[#697468]">
              온라인 결제는 1차 MVP 범위에서 제외되어 있으며, 실제 결제 방식은 매장 정책에 따릅니다.
            </p>
          </div>

          <p className="mt-3 rounded-md bg-[#edf6ef] px-3 py-2 text-xs font-bold leading-5 text-vista-leaf">
            1시간 예약은 서비스 시간 10분을 더해 총 70분 이용으로 배정됩니다.
          </p>

          {durationMinutes >= 90 || bonusMinutes > 0 ? (
            <p className="mt-3 rounded-md bg-[#eef5ff] px-3 py-2 text-xs font-bold leading-5 text-[#28516f]">
              선택한 시작 시간부터 총 {reservedMinutes}분 구간이 한 번에 예약됩니다.
            </p>
          ) : null}

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

          {isReviewing ? (
            <section className="mt-5 rounded-md border border-vista-mint bg-vista-fairway p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="text-vista-leaf" size={21} aria-hidden="true" />
                <h2 className="text-lg font-extrabold">5. 예약 확인</h2>
              </div>
              <dl className="mt-4 grid gap-2 text-sm">
                {[
                  ["매장", selectedStore?.name ?? "매장 선택 대기"],
                  ["주소", selectedStore?.address ?? "주소 준비 중"],
                  ["날짜", formatReservationDate(selectedDate)],
                  ["시간", `${selectedTime} ~ ${new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(previewEndsAt)}`],
                  ["이용시간", formatDurationLabel(durationMinutes)],
                  ["인원", `${partySize}명`],
                  ["타석", selectedBay ? `${selectedBay.bay_code} · ${selectedBay.display_name}` : "자동 배정"],
                  ["예상요금", formatCurrency(estimatedPrice)],
                  ["취소안내", "예약 시간 1시간 전까지 매장에 연락해 취소할 수 있습니다."]
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4 rounded-md bg-white/80 px-3 py-2">
                    <dt className="shrink-0 font-bold text-[#697468]">{label}</dt>
                    <dd className="text-right font-extrabold">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

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

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[#d9e3d5] bg-white/95 px-4 py-3 shadow-[0_-12px_30px_rgba(25,33,28,0.12)] backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-[#697468]">
              {selectedStore?.name ?? "매장 선택"} · {selectedTime} · {formatDurationLabel(durationMinutes)}
            </p>
            <p className="mt-0.5 text-sm font-extrabold text-vista-ink">{formatCurrency(estimatedPrice)}</p>
          </div>
          <button
            type="button"
            onClick={handlePrimaryAction}
            disabled={isLoading || !selectedStore}
            className="flex min-h-[52px] min-w-[156px] items-center justify-center gap-2 rounded-md bg-vista-leaf px-4 py-3 text-base font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? <Loader2 className="animate-spin" size={20} aria-hidden="true" /> : null}
            {isReviewing ? "예약 확정" : "예약 내용 확인"}
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
      </div>
    </main>
  );
}
