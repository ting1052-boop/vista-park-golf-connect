"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarCheck, Delete, Loader2, MonitorPlay, Phone, Store, UserRound } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { durationOptions, getDurationLabel, priceByDuration } from "@/lib/reservation-policy";

const DEFAULT_STORE_ID = "11111111-1111-4111-8111-111111111111";
const DONE_AUTO_RESET_SECONDS = 30;

type StoreInfo = {
  id: string;
  name: string;
  phone: string | null;
};

type KioskReservation = {
  id: string;
  startsAt: string;
  endsAt: string;
  partySize: number;
  status: string;
  approvalRequired: boolean;
  guestName: string | null;
  bayCode: string | null;
};

type DoneInfo = {
  bayCode: string | null;
  startsAt: string;
  endsAt: string;
  automationStatus: string;
};

type Screen =
  | "home"
  | "phone"
  | "select"
  | "walkin-party"
  | "walkin-duration"
  | "walkin-confirm"
  | "processing"
  | "done";

function formatClock(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function getKioskKey() {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("key");

  if (fromUrl) {
    window.localStorage.setItem("vista-kiosk-key", fromUrl);
    return fromUrl;
  }

  return window.localStorage.getItem("vista-kiosk-key");
}

async function callKioskApi<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const kioskKey = getKioskKey();
  if (kioskKey) headers["x-kiosk-key"] = kioskKey;

  const response = await fetch(path, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  const data = (await response.json()) as T & { ok: boolean; message?: string };

  if (!response.ok || !data.ok) {
    throw new Error(data.message ?? "요청을 처리하지 못했습니다.");
  }

  return data;
}

export default function KioskEntrancePage() {
  const [screen, setScreen] = useState<Screen>("home");
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [phoneLast4, setPhoneLast4] = useState("");
  const [reservations, setReservations] = useState<KioskReservation[]>([]);
  const [partySize, setPartySize] = useState(2);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [processingText, setProcessingText] = useState("처리 중입니다");
  const [done, setDone] = useState<DoneInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase
      .from("stores")
      .select("id, name, phone")
      .eq("id", DEFAULT_STORE_ID)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setStore(data as StoreInfo);
      });
  }, []);

  const resetToHome = useCallback(() => {
    setScreen("home");
    setPhoneLast4("");
    setReservations([]);
    setPartySize(2);
    setDurationMinutes(60);
    setDone(null);
    setError(null);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (screen !== "done") return;

    const timer = window.setTimeout(resetToHome, DONE_AUTO_RESET_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [screen, resetToHome]);

  const pressDigit = (digit: string) => {
    setError(null);
    setPhoneLast4((current) => (current.length >= 4 ? current : current + digit));
  };

  const lookupReservations = async () => {
    if (!/^\d{4}$/.test(phoneLast4)) {
      setError("전화번호 뒤 4자리를 입력해주세요.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await callKioskApi<{ reservations: KioskReservation[] }>("/api/kiosk/reservation/check-in", {
        storeId: DEFAULT_STORE_ID,
        phoneLast4
      });

      if (data.reservations.length === 0) {
        setError("예약을 찾을 수 없습니다. 전화번호 뒤 4자리를 다시 확인해주세요.");
        setIsLoading(false);
        return;
      }

      setReservations(data.reservations);
      setScreen("select");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "예약 조회에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const checkIn = async (reservationId: string) => {
    setScreen("processing");
    setProcessingText("입장 처리 중입니다");
    setError(null);

    try {
      const data = await callKioskApi<DoneInfo>("/api/kiosk/reservation/check-in", {
        storeId: DEFAULT_STORE_ID,
        phoneLast4,
        reservationId
      });

      setDone(data);
      setScreen("done");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "입장 처리에 실패했습니다.");
      setScreen("select");
    }
  };

  const startWalkIn = async () => {
    setScreen("processing");
    setProcessingText("타석을 준비하고 있습니다");
    setError(null);

    try {
      const data = await callKioskApi<DoneInfo>("/api/kiosk/walk-in/start", {
        storeId: DEFAULT_STORE_ID,
        partySize,
        durationMinutes,
        paymentStatus: "mock_paid"
      });

      setDone(data);
      setScreen("done");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "현장 이용 처리에 실패했습니다.");
      setScreen("walkin-confirm");
    }
  };

  const keypad = useMemo(
    () => ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
    []
  );

  return (
    <main className="flex min-h-screen flex-col bg-[#eef2ec] px-6 py-8 text-vista-ink">
      <header className="text-center">
        <p className="text-lg font-bold text-vista-leaf">VISTA Park Golf Connect</p>
        <h1 className="mt-1 text-[34px] font-extrabold leading-tight">{store?.name ?? "비스타파크골프"}</h1>
      </header>

      <div className={`mx-auto mt-8 w-full flex-1 ${screen === "home" ? "max-w-5xl" : "max-w-2xl"}`}>
        {screen === "home" ? (
          <section className="grid min-h-[62vh] content-center gap-8">
            <h2 className="text-center text-[34px] font-extrabold">오늘 이용을 시작할까요?</h2>
            <div className="flex flex-col items-center gap-6 md:flex-row md:justify-center md:gap-[5%]">
            <button
              type="button"
              onClick={() => setScreen("phone")}
              className="flex min-h-[220px] w-full items-center justify-center gap-5 rounded-[28px] bg-vista-leaf px-8 text-[30px] font-extrabold text-white shadow-soft-line md:h-[50vh] md:min-h-[320px] md:w-[40%] md:flex-col md:text-[34px]"
            >
              <CalendarCheck className="size-12 md:size-16" aria-hidden="true" />
              예약하고 왔어요
            </button>
            <button
              type="button"
              onClick={() => setScreen("walkin-party")}
              className="flex min-h-[220px] w-full items-center justify-center gap-5 rounded-[28px] border-2 border-vista-leaf bg-white px-8 text-[30px] font-extrabold text-vista-leaf shadow-soft-line md:h-[50vh] md:min-h-[320px] md:w-[40%] md:flex-col md:text-[34px]"
            >
              <MonitorPlay className="size-12 md:size-16" aria-hidden="true" />
              <span className="grid leading-tight">
                <span>바로이용</span>
                <span className="text-[24px] md:text-[28px]">예약없이 왔어요</span>
              </span>
            </button>
            </div>
          </section>
        ) : null}

        {screen === "phone" ? (
          <section className="rounded-[24px] border border-[#d9e3d5] bg-white p-8 shadow-soft-line">
            <h2 className="text-center text-[30px] font-extrabold">예약 확인</h2>
            <p className="mt-2 text-center text-[20px] font-semibold text-[#4f5b50]">전화번호 뒤 4자리를 입력해주세요.</p>

            <div className="mx-auto mt-6 flex h-[76px] w-64 items-center justify-center gap-3 rounded-[16px] border-2 border-[#cad8c6] bg-[#fbfcfa]">
              <Phone size={26} className="text-[#697468]" aria-hidden="true" />
              <span className="text-[34px] font-extrabold tracking-[0.4em]">{phoneLast4.padEnd(4, "·")}</span>
            </div>

            <div className="mx-auto mt-6 grid max-w-sm grid-cols-3 gap-3">
              {keypad.map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => pressDigit(digit)}
                  className="min-h-[76px] rounded-[16px] border border-[#cad8c6] bg-white text-[28px] font-extrabold active:bg-vista-fairway"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPhoneLast4((current) => current.slice(0, -1))}
                className="flex min-h-[76px] items-center justify-center rounded-[16px] border border-[#cad8c6] bg-white text-[#8a5a21] active:bg-vista-fairway"
              >
                <Delete size={30} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => pressDigit("0")}
                className="min-h-[76px] rounded-[16px] border border-[#cad8c6] bg-white text-[28px] font-extrabold active:bg-vista-fairway"
              >
                0
              </button>
              <button
                type="button"
                onClick={lookupReservations}
                disabled={isLoading}
                className="flex min-h-[76px] items-center justify-center rounded-[16px] bg-vista-leaf text-[24px] font-extrabold text-white disabled:opacity-60"
              >
                {isLoading ? <Loader2 className="animate-spin" size={28} aria-hidden="true" /> : "확인"}
              </button>
            </div>
          </section>
        ) : null}

        {screen === "select" ? (
          <section className="rounded-[24px] border border-[#d9e3d5] bg-white p-8 shadow-soft-line">
            <h2 className="text-center text-[30px] font-extrabold">예약을 확인했습니다</h2>
            <div className="mt-6 grid gap-4">
              {reservations.map((reservation) => (
                <button
                  key={reservation.id}
                  type="button"
                  onClick={() => checkIn(reservation.id)}
                  disabled={reservation.status === "checked_in" || reservation.approvalRequired}
                  className="grid min-h-[96px] gap-1 rounded-[20px] border-2 border-[#cad8c6] bg-white p-5 text-left disabled:opacity-50"
                >
                  <span className="text-[26px] font-extrabold">
                    {formatClock(reservation.startsAt)} ~ {formatClock(reservation.endsAt)}
                  </span>
                  <span className="text-[20px] font-semibold text-[#4f5b50]">
                    {reservation.partySize}명 · 타석 {reservation.bayCode ?? "자동 배정"}
                    {reservation.status === "checked_in"
                      ? " · 입장 완료"
                      : reservation.approvalRequired
                        ? " · 승인 대기"
                        : " · 입장하려면 누르세요"}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {screen === "walkin-party" ? (
          <section className="rounded-[24px] border border-[#d9e3d5] bg-white p-8 shadow-soft-line">
            <h2 className="flex items-center justify-center gap-3 text-center text-[30px] font-extrabold">
              <UserRound size={30} className="text-vista-leaf" aria-hidden="true" />
              몇 명이 이용하시나요?
            </h2>
            <div className="mt-6 grid grid-cols-2 gap-4">
              {[1, 2, 3, 4, 5, 6].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => {
                    setPartySize(count);
                    setScreen("walkin-duration");
                  }}
                  className="min-h-[88px] rounded-[20px] border-2 border-[#cad8c6] bg-white text-[26px] font-extrabold active:bg-vista-fairway"
                >
                  {count}명
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {screen === "walkin-duration" ? (
          <section className="rounded-[24px] border border-[#d9e3d5] bg-white p-8 shadow-soft-line">
            <h2 className="text-center text-[30px] font-extrabold">이용시간을 선택해주세요</h2>
            <div className="mt-6 grid gap-4">
              {durationOptions.map((option) => (
                <button
                  key={option.minutes}
                  type="button"
                  onClick={() => {
                    setDurationMinutes(option.minutes);
                    setScreen("walkin-confirm");
                  }}
                  className="flex min-h-[88px] items-center justify-between rounded-[20px] border-2 border-[#cad8c6] bg-white px-6 text-[24px] font-extrabold active:bg-vista-fairway"
                >
                  <span>{getDurationLabel(option.minutes)}</span>
                  <span className="text-vista-leaf">{option.price.toLocaleString("ko-KR")}원</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {screen === "walkin-confirm" ? (
          <section className="rounded-[24px] border border-[#d9e3d5] bg-white p-8 shadow-soft-line">
            <h2 className="text-center text-[30px] font-extrabold">이용 내용을 확인해주세요</h2>
            <dl className="mt-6 grid gap-3 text-[22px]">
              {[
                ["매장", store?.name ?? "비스타파크골프"],
                ["인원", `${partySize}명`],
                ["이용시간", getDurationLabel(durationMinutes)],
                ["요금", `${priceByDuration[durationMinutes].toLocaleString("ko-KR")}원`],
                ["배정 방식", "빈 타석 자동 배정"]
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between rounded-[14px] bg-vista-fairway px-5 py-4">
                  <dt className="font-bold text-[#4f5b50]">{label}</dt>
                  <dd className="font-extrabold">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-center text-[17px] font-semibold text-[#8a5a21]">
              결제 연동 전 단계로, 요금은 매장에서 결제해주세요.
            </p>
            <button
              type="button"
              onClick={startWalkIn}
              className="mt-5 flex min-h-[88px] w-full items-center justify-center rounded-[20px] bg-vista-leaf text-[26px] font-extrabold text-white"
            >
              결제 완료 처리
            </button>
          </section>
        ) : null}

        {screen === "processing" ? (
          <section className="rounded-[24px] border border-[#d9e3d5] bg-white p-10 text-center shadow-soft-line">
            <Loader2 className="mx-auto animate-spin text-vista-leaf" size={64} aria-hidden="true" />
            <h2 className="mt-6 text-[30px] font-extrabold">{processingText}</h2>
            <p className="mt-4 text-[20px] font-semibold leading-8 text-[#4f5b50]">
              조명 준비 중 · PC 전원 켜는 중
              <br />
              프로젝터 준비 중 · 타석 배정 중
            </p>
            <p className="mt-4 text-[18px] font-semibold text-[#697468]">잠시만 기다려주세요.</p>
          </section>
        ) : null}

        {screen === "done" && done ? (
          <section className="rounded-[24px] border-2 border-vista-mint bg-white p-10 text-center shadow-soft-line">
            <h2 className="text-[32px] font-extrabold text-vista-leaf">입장이 완료되었습니다</h2>
            <p className="mt-6 text-[28px] font-extrabold">배정 타석: {done.bayCode ?? "안내 데스크 문의"}</p>
            <p className="mt-2 text-[24px] font-bold text-[#4f5b50]">
              이용시간: {formatClock(done.startsAt)} ~ {formatClock(done.endsAt)}
            </p>
            <p className="mt-6 text-[20px] font-semibold leading-8 text-[#4f5b50]">
              {done.automationStatus === "requested"
                ? "장비를 준비하고 있습니다. 타석으로 이동해주세요."
                : "타석으로 이동해주세요. 화면이 켜지지 않으면 매장에 연락해주세요."}
            </p>
            <button
              type="button"
              onClick={resetToHome}
              className="mt-8 min-h-[72px] w-full rounded-[20px] border-2 border-[#cad8c6] text-[22px] font-extrabold"
            >
              처음으로
            </button>
          </section>
        ) : null}

        {error ? (
          <p className="mt-5 rounded-[16px] border border-amber-200 bg-amber-50 px-5 py-4 text-center text-[20px] font-bold text-amber-900">
            {error}
          </p>
        ) : null}

        {screen !== "home" && screen !== "processing" && screen !== "done" ? (
          <button
            type="button"
            onClick={resetToHome}
            className="mx-auto mt-6 block min-h-[64px] w-full max-w-sm rounded-[16px] border border-[#cad8c6] bg-white text-[20px] font-extrabold text-[#4f5b50]"
          >
            처음으로
          </button>
        ) : null}
      </div>

      <footer className="mt-8 flex items-center justify-center gap-2 text-center text-[18px] font-bold text-[#697468]">
        <Store size={20} aria-hidden="true" />
        매장 전화 {store?.phone ?? "031-431-7050"} · 문제가 있으면 매장에 연락해주세요.
      </footer>
    </main>
  );
}
