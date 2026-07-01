"use client";

import { useEffect, useState } from "react";
import { Download, Smartphone } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isStandaloneDisplay() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function PwaInstallCard() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    setIsStandalone(isStandaloneDisplay());
    setIsIos(isIosDevice());
    setIsDismissed(window.localStorage.getItem("vista-pwa-install-dismissed") === "true");

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setIsStandalone(true);
      window.localStorage.setItem("vista-pwa-install-dismissed", "true");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  if (isStandalone || isDismissed) return null;
  if (!installPrompt && !isIos) return null;

  const install = async () => {
    if (!installPrompt) return;

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;

    if (choice.outcome === "accepted") {
      window.localStorage.setItem("vista-pwa-install-dismissed", "true");
    }

    setInstallPrompt(null);
  };

  const dismiss = () => {
    window.localStorage.setItem("vista-pwa-install-dismissed", "true");
    setIsDismissed(true);
  };

  return (
    <section className="mt-5 rounded-md border border-[#d9e3d5] bg-[#fbfcfa] p-4">
      <div className="flex gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-vista-leaf text-white">
          <Smartphone size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-extrabold">앱처럼 사용하기</h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-[#697468]">
            홈 화면에 추가하면 주소 입력 없이 바로 예약 화면을 열 수 있습니다.
          </p>
          {isIos ? (
            <p className="mt-2 rounded-md bg-white px-3 py-2 text-xs font-bold leading-5 text-[#4f5b50]">
              아이폰은 Safari 공유 버튼에서 홈 화면에 추가를 선택해주세요.
            </p>
          ) : null}
          <div className="mt-3 flex gap-2">
            {installPrompt ? (
              <button
                type="button"
                onClick={install}
                className="flex items-center gap-2 rounded-md bg-vista-leaf px-3 py-2 text-sm font-extrabold text-white"
              >
                <Download size={16} aria-hidden="true" />
                앱 설치
              </button>
            ) : null}
            <button
              type="button"
              onClick={dismiss}
              className="rounded-md border border-[#cad8c6] bg-white px-3 py-2 text-sm font-extrabold text-[#4f5b50]"
            >
              나중에
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
