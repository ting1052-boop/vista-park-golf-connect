"use client";

import { useState } from "react";
import { Loader2, LogIn, ShieldCheck } from "lucide-react";
import { signInWithMemberProvider, type MemberSocialProvider } from "@/lib/auth/social-login";

const loginOptions: Array<{
  provider: MemberSocialProvider;
  label: string;
  description: string;
  className: string;
}> = [
  {
    provider: "kakao",
    label: "카카오로 시작",
    description: "카카오 계정으로 회원 예약 정보를 연결합니다.",
    className: "border-[#e4cf2d] bg-[#fee500] text-[#191600]"
  },
  {
    provider: "naver",
    label: "네이버로 시작",
    description: "네이버 계정으로 회원 예약 정보를 연결합니다.",
    className: "border-[#02b957] bg-[#03c75a] text-white"
  }
];

export function SocialLoginPanel() {
  const [pendingProvider, setPendingProvider] = useState<MemberSocialProvider | null>(null);
  const [message, setMessage] = useState("로그인 없이도 예약 신청은 가능합니다. 회원 예약은 나중에 계정과 연결됩니다.");

  async function handleLogin(provider: MemberSocialProvider) {
    setPendingProvider(provider);
    setMessage("소셜 로그인 화면으로 이동합니다.");

    try {
      await signInWithMemberProvider(provider);
    } catch (error) {
      const fallback = error instanceof Error ? error.message : "로그인 연결 중 오류가 발생했습니다.";
      setMessage(fallback);
      setPendingProvider(null);
    }
  }

  return (
    <section className="rounded-md border border-[#dce7d8] bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-md bg-vista-fairway text-vista-leaf">
          <ShieldCheck size={22} aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-bold text-vista-leaf">회원 계정</p>
          <h2 className="mt-1 text-xl font-extrabold">카카오 또는 네이버로 예약 관리</h2>
          <p className="mt-2 text-sm leading-6 text-[#687568]">
            소셜 로그인 설정을 완료하면 예약 내역, 노쇼 이력, 선호 매장을 회원 계정으로 관리할 수 있습니다.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        {loginOptions.map((option) => {
          const isPending = pendingProvider === option.provider;

          return (
            <button
              key={option.provider}
              type="button"
              onClick={() => handleLogin(option.provider)}
              disabled={pendingProvider !== null}
              className={`flex min-h-14 items-center justify-between gap-3 rounded-md border px-4 py-3 text-left font-extrabold transition disabled:cursor-not-allowed disabled:opacity-70 ${option.className}`}
            >
              <span>
                <span className="block text-base">{option.label}</span>
                <span className="mt-1 block text-xs font-bold opacity-80">{option.description}</span>
              </span>
              {isPending ? <Loader2 className="animate-spin" size={22} aria-hidden="true" /> : <LogIn size={22} aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      <p className="mt-3 rounded-md bg-[#f4f7f2] px-3 py-2 text-sm font-semibold text-[#5f6e61]">{message}</p>
    </section>
  );
}
