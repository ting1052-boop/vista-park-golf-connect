"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarCheck, Delete, Loader2, MonitorPlay, Phone, Store } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { durationOptions, getDurationLabel, priceByDuration } from "@/lib/reservation-policy";

const DEFAULT_STORE_ID = "11111111-1111-4111-8111-111111111111";
const DONE_AUTO_RESET_SECONDS = 30;

// 후불(계좌이체) 안내 계좌. 지금은 코드에 두고, 이후 매장설정(store_settings)
// 으로 옮긴다. ⚠️ 아래 값을 실제 매장 입금 계좌로 바꿔야 합니다.
const STORE_BANK_ACCOUNT = {
  bank: "국민은행",
  number: "000000-00-000000",
  holder: "비스타파크골프 시흥점"
};

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
  // 후불 계좌이체 안내용. 예약 입장(이미 확정)에는 없고, 현장 이용에만 채워진다.
  amountDue?: number | null;
};

type Screen =
  | "home"
  | "phone"
  | "select"
  | "walkin-duration"
  | "walkin-bay"
  | "walkin-confirm"
  | "processing"
  | "done";

type KioskBayInfo = {
  id: string;
  bayCode: string;
  displayName: string;
  status: string;
  isFree: boolean;
};

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
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [bays, setBays] = useState<KioskBayInfo[]>([]);
  const [selectedBay, setSelectedBay] = useState<KioskBayInfo | null>(null);
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
    setDurationMinutes(60);
    setBays([]);
    setSelectedBay(null);
    setDone(null);
    setError(null);
    setIsLoading(false);
  }, []);

  // 이용시간 선택 후 타석 배치도(가용성)를 불러온다.
  const loadBays = async (minutes: number) => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await callKioskApi<{ bays: KioskBayInfo[] }>("/api/kiosk/bays", {
        storeId: DEFAULT_STORE_ID,
        durationMinutes: minutes
      });
      setBays(data.bays);
      setScreen("walkin-bay");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "타석 정보를 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

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
        partySize: 1,
        durationMinutes,
        bayId: selectedBay?.id ?? null,
        paymentStatus: "postpaid"
      });

      // 후불이므로 완료 화면에서 입금 안내를 위해 금액을 함께 전달한다.
      setDone({ ...data, amountDue: priceByDuration[durationMinutes] });
      setScreen("done");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "현장 이용 처리에 실패했습니다.");
      // 선택한 타석이 마감됐을 수 있으니 타석 선택 화면으로 되돌려 다시 고르게 한다.
      await loadBays(durationMinutes);
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
              onClick={() => setScreen("walkin-duration")}
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
                    setSelectedBay(null);
                    void loadBays(option.minutes);
                  }}
                  disabled={isLoading}
                  className="flex min-h-[88px] items-center justify-between rounded-[20px] border-2 border-[#cad8c6] bg-white px-6 text-[24px] font-extrabold active:bg-vista-fairway disabled:opacity-60"
                >
                  <span>{getDurationLabel(option.minutes)}</span>
                  <span className="text-vista-leaf">{option.price.toLocaleString("ko-KR")}원</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {screen === "walkin-bay" ? (
          <section className="rounded-[24px] border border-[#d9e3d5] bg-white p-8 shadow-soft-line">
            <h2 className="text-center text-[30px] font-extrabold">타석을 선택해주세요</h2>
            <p className="mt-2 text-center text-[18px] font-semibold text-[#4f5b50]">
              초록색 타석을 눌러 자리를 선택하세요.
            </p>

            <div className="mt-8 grid grid-cols-3 gap-4">
              {bays.map((bay) => (
                <button
                  key={bay.id}
                  type="button"
                  disabled={!bay.isFree}
                  onClick={() => {
                    setSelectedBay(bay);
                    setScreen("walkin-confirm");
                  }}
                  className={`flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-[20px] border-2 text-center ${
                    bay.isFree
                      ? "border-vista-leaf bg-vista-fairway active:scale-[0.98]"
                      : "cursor-not-allowed border-[#d8ddd5] bg-[#f0f2ee]"
                  }`}
                >
                  <span className={`text-[40px] font-extrabold ${bay.isFree ? "text-vista-ink" : "text-[#9aa39a]"}`}>
                    {bay.bayCode}
                  </span>
                  <span className={`text-[18px] font-bold ${bay.isFree ? "text-vista-leaf" : "text-[#9aa39a]"}`}>
                    {bay.isFree ? "선택 가능" : bay.status === "maintenance" ? "점검 중" : "이용 중"}
                  </span>
                </button>
              ))}
            </div>

            <p className="mt-6 text-center text-[15px] font-semibold text-[#697468]">← 안내 데스크 방향 · 창측 →</p>
          </section>
        ) : null}

        {screen === "walkin-confirm" ? (
          <section className="rounded-[24px] border border-[#d9e3d5] bg-white p-8 shadow-soft-line">
            <h2 className="text-center text-[30px] font-extrabold">이용 내용을 확인해주세요</h2>
            <dl className="mt-6 grid gap-3 text-[22px]">
              {[
                ["매장", store?.name ?? "비스타파크골프"],
                ["타석", selectedBay ? `${selectedBay.bayCode} · ${selectedBay.displayName}` : "빈 타석 자동 배정"],
                ["이용시간", getDurationLabel(durationMinutes)],
                ["요금", `${priceByDuration[durationMinutes].toLocaleString("ko-KR")}원`],
                ["결제 방식", "후불 · 계좌이체"]
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between rounded-[14px] bg-vista-fairway px-5 py-4">
                  <dt className="font-bold text-[#4f5b50]">{label}</dt>
                  <dd className="font-extrabold">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-center text-[17px] font-semibold text-[#8a5a21]">
              지금 이용을 시작하고, 요금은 이용 후 계좌로 입금해주세요.
            </p>
            <button
              type="button"
              onClick={startWalkIn}
              className="mt-5 flex min-h-[88px] w-full items-center justify-center rounded-[20px] bg-vista-leaf text-[26px] font-extrabold text-white"
            >
              이용 시작하기
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

            {done.amountDue != null ? (
              <div className="mt-8 rounded-[20px] border-2 border-vista-leaf bg-vista-fairway p-6 text-left">
                <p className="text-center text-[20px] font-extrabold text-vista-leaf">이용 후 아래 계좌로 입금해주세요</p>
                <div className="mt-4 grid gap-2 text-[22px]">
                  <div className="flex justify-between">
                    <span className="font-bold text-[#4f5b50]">입금 계좌</span>
                    <span className="font-extrabold">
                      {STORE_BANK_ACCOUNT.bank} {STORE_BANK_ACCOUNT.number}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold text-[#4f5b50]">예금주</span>
                    <span className="font-extrabold">{STORE_BANK_ACCOUNT.holder}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold text-[#4f5b50]">입금 금액</span>
                    <span className="text-[26px] font-extrabold text-vista-leaf">
                      {done.amountDue.toLocaleString("ko-KR")}원
                    </span>
                  </div>
                </div>
              </div>
            ) : null}

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
