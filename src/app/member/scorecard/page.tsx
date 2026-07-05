"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { CalendarClock, ChevronLeft, ClipboardCheck, Loader2, Phone, Store, UserRound } from "lucide-react";

type MemberReservation = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string | null;
  approvalRequired: boolean | null;
  storeName: string;
  storeAddress: string | null;
  storePhone: string | null;
  bayLabel: string;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function getStatusLabel(status: string | null, approvalRequired: boolean | null) {
  if (approvalRequired) return "승인 대기";
  if (status === "confirmed") return "예약 확정";
  if (status === "checked_in") return "입장 완료";
  if (status === "cancelled") return "취소";
  if (status === "no_show") return "노쇼";
  return "신청 완료";
}

export default function MemberReservationsPage() {
  const [guestName, setGuestName] = useState("");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [reservations, setReservations] = useState<MemberReservation[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!guestName.trim()) {
      setError("예약자 이름을 입력해주세요.");
      return;
    }

    if (!/^\d{4}$/.test(phoneLast4)) {
      setError("전화번호 뒤 4자리를 숫자로 입력해주세요.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/member/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestName: guestName.trim(), phoneLast4 })
      });
      const data = (await response.json()) as {
        ok?: boolean;
        message?: string;
        reservations?: MemberReservation[];
      };

      if (!response.ok || !data.ok) {
        throw new Error(data.message ?? "예약 내역을 불러오지 못했습니다.");
      }

      const nextReservations = data.reservations ?? [];
      setReservations(nextReservations);
      setHasSearched(true);
      setMessage(nextReservations.length > 0 ? "예약 내역을 불러왔습니다." : "일치하는 예약 내역이 없습니다.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "예약 내역 조회에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#eef2ec] px-4 py-6 text-vista-ink">
      <div className="mx-auto max-w-md rounded-[28px] border border-[#d9e3d5] bg-white p-5 shadow-soft-line">
        <Link href="/member/app" className="inline-flex items-center gap-1 text-sm font-extrabold text-vista-leaf">
          <ChevronLeft size={18} aria-hidden="true" />
          예약 화면으로
        </Link>

        <header className="mt-4 flex items-center justify-between gap-3 border-b border-[#e5ece1] pb-4">
          <div>
            <p className="text-xs font-bold text-vista-leaf">VISTA Park Golf Connect</p>
            <h1 className="mt-1 text-2xl font-extrabold">내 예약 내역</h1>
          </div>
          <div className="grid size-12 place-items-center rounded-md bg-vista-leaf text-white">
            <ClipboardCheck size={24} aria-hidden="true" />
          </div>
        </header>

        <form onSubmit={handleSubmit} className="mt-5 rounded-md border border-[#dfe8dc] p-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="text-vista-leaf" size={21} aria-hidden="true" />
            <h2 className="text-lg font-extrabold">예약 조회</h2>
          </div>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#697468]">
            예약할 때 입력한 이름과 전화번호 뒤 4자리로 내 예약을 확인합니다.
          </p>

          <div className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm font-bold text-[#4f5b50]">
              예약자 이름
              <div className="flex items-center gap-2 rounded-md border border-[#cad8c6] bg-[#fbfcfa] px-3 py-3">
                <UserRound size={18} className="text-[#697468]" aria-hidden="true" />
                <input
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
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
            type="submit"
            disabled={isLoading}
            className="mt-4 flex min-h-[54px] w-full items-center justify-center gap-2 rounded-md bg-vista-leaf px-4 py-3 text-base font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? <Loader2 className="animate-spin" size={20} aria-hidden="true" /> : null}
            내 예약 조회
          </button>
        </form>

        <section className="mt-5">
          <div className="flex items-center gap-2">
            <Store className="text-vista-leaf" size={21} aria-hidden="true" />
            <h2 className="text-lg font-extrabold">예약 목록</h2>
          </div>

          <div className="mt-3 grid gap-3">
            {reservations.map((reservation) => (
              <article key={reservation.id} className="rounded-md border border-[#e5ece1] bg-[#fbfcfa] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-extrabold">{formatDateTime(reservation.startsAt)}</p>
                    <p className="mt-1 text-sm font-bold text-[#697468]">
                      {formatTime(reservation.startsAt)} ~ {formatTime(reservation.endsAt)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md bg-[#edf6ef] px-3 py-1 text-xs font-bold text-vista-leaf">
                    {getStatusLabel(reservation.status, reservation.approvalRequired)}
                  </span>
                </div>
                <div className="mt-3 rounded-md bg-white p-3 ring-1 ring-[#e5ece1]">
                  <p className="font-extrabold">{reservation.storeName}</p>
                  <p className="mt-1 text-sm font-semibold text-[#697468]">{reservation.bayLabel}</p>
                  {reservation.storeAddress ? (
                    <p className="mt-2 text-xs font-bold text-[#697468]">{reservation.storeAddress}</p>
                  ) : null}
                  {reservation.storePhone ? <p className="mt-1 text-xs font-bold text-vista-leaf">{reservation.storePhone}</p> : null}
                </div>
              </article>
            ))}

            {hasSearched && reservations.length === 0 ? (
              <article className="rounded-md border border-[#e5ece1] p-4 text-sm font-bold text-[#697468]">
                입력한 정보와 일치하는 예약이 없습니다.
              </article>
            ) : null}

            {!hasSearched ? (
              <article className="rounded-md border border-[#e5ece1] p-4 text-sm font-bold text-[#697468]">
                예약자 정보를 입력하고 조회 버튼을 눌러주세요.
              </article>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
