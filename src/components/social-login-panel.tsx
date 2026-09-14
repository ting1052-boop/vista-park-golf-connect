"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, LogIn, LogOut, ShieldCheck } from "lucide-react";
import { signInWithMemberProvider, type MemberSocialProvider } from "@/lib/auth/social-login";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type LoginUser = {
  id: string;
  displayName: string;
};

function getKakaoUser(user: {
  id: string;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
}): LoginUser | null {
  if (user.app_metadata.provider !== "kakao") return null;

  const metadata = user.user_metadata;
  const displayName =
    (typeof metadata.user_name === "string" && metadata.user_name) ||
    (typeof metadata.nickname === "string" && metadata.nickname) ||
    (typeof metadata.full_name === "string" && metadata.full_name) ||
    "카카오 회원";

  return { id: user.id, displayName };
}

export function SocialLoginPanel() {
  const [pendingProvider, setPendingProvider] = useState<MemberSocialProvider | null>(null);
  const [user, setUser] = useState<LoginUser | null>(null);
  const [message, setMessage] = useState("로그인 없이도 예약할 수 있습니다. 카카오 로그인 시 내 예약을 한 계정에서 관리할 수 있습니다.");

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();

    void supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      setUser(getKakaoUser(data.user));
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setUser(null);
        return;
      }

      setUser(getKakaoUser(session.user));
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleLogin(provider: MemberSocialProvider) {
    setPendingProvider(provider);
    setMessage("소셜 로그인 화면으로 이동합니다.");

    try {
      const supabase = createBrowserSupabaseClient();
      const { data } = await supabase.auth.getUser();
      if (data.user && data.user.app_metadata.provider !== "kakao") {
        await supabase.auth.signOut();
      }
      await signInWithMemberProvider(provider);
    } catch (error) {
      const fallback = error instanceof Error ? error.message : "로그인 연결 중 오류가 발생했습니다.";
      setMessage(fallback);
      setPendingProvider(null);
    }
  }

  async function handleLogout() {
    setMessage("로그아웃하고 있습니다.");
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      setMessage("로그아웃하지 못했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    setUser(null);
    setMessage("로그아웃했습니다. 비회원 예약도 계속 이용할 수 있습니다.");
  }

  return (
    <section className="rounded-md border border-[#dce7d8] bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-md bg-vista-fairway text-vista-leaf">
          <ShieldCheck size={22} aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-bold text-vista-leaf">회원 계정</p>
          <h2 className="mt-1 text-xl font-extrabold">카카오로 간편 로그인</h2>
          <p className="mt-2 text-sm leading-6 text-[#687568]">
            카카오 계정으로 로그인하면 예약자 닉네임을 불러오고 내 예약을 안전하게 관리할 수 있습니다.
          </p>
        </div>
      </div>

      <div className="mt-4">
        {user ? (
          <div className="rounded-md border border-[#b9dec7] bg-[#edf8f1] p-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="shrink-0 text-vista-leaf" size={24} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-extrabold">{user.displayName}님</p>
                <p className="mt-1 text-xs font-bold text-[#5f6e61]">카카오 로그인이 완료되었습니다.</p>
              </div>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md border border-[#bfd0bc] bg-white px-3 text-sm font-extrabold"
              >
                <LogOut size={17} aria-hidden="true" />
                로그아웃
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => handleLogin("kakao")}
            disabled={pendingProvider !== null}
            className="flex min-h-16 w-full items-center justify-between gap-3 rounded-md border border-[#e4cf2d] bg-[#fee500] px-4 py-3 text-left font-extrabold text-[#191600] transition disabled:cursor-not-allowed disabled:opacity-70"
          >
            <span>
              <span className="block text-base">카카오로 시작</span>
              <span className="mt-1 block text-xs font-bold opacity-80">카카오 계정으로 예약 정보를 연결합니다.</span>
            </span>
            {pendingProvider ? <Loader2 className="animate-spin" size={22} aria-hidden="true" /> : <LogIn size={22} aria-hidden="true" />}
          </button>
        )}
      </div>

      <p className="mt-3 rounded-md bg-[#f4f7f2] px-3 py-2 text-sm font-semibold text-[#5f6e61]">{message}</p>
    </section>
  );
}
