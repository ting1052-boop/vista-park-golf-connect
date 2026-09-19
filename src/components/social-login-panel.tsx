"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
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

// 예약 화면 맨 위에 놓는 한 줄짜리 바. 로그인은 전체 페이지 리다이렉트라
// 입력을 마친 뒤에 누르면 적어둔 내용이 사라진다. 그래서 적기 전에 고르게 둔다.
export function SocialLoginPanel() {
  const [pendingProvider, setPendingProvider] = useState<MemberSocialProvider | null>(null);
  const [user, setUser] = useState<LoginUser | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
    setMessage(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data } = await supabase.auth.getUser();
      if (data.user && data.user.app_metadata.provider !== "kakao") {
        await supabase.auth.signOut();
      }
      await signInWithMemberProvider(provider);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "로그인 연결 중 오류가 발생했습니다.");
      setPendingProvider(null);
    }
  }

  async function handleLogout() {
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      setMessage("로그아웃하지 못했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    setUser(null);
    setMessage("로그아웃했습니다. 로그인 없이도 예약할 수 있습니다.");
  }

  return (
    <section className="rounded-md border border-[#dce7d8] bg-[#fbfcfa] px-3 py-2.5">
      <div className="flex items-center gap-3">
        {user ? (
          <>
            <CheckCircle2 className="shrink-0 text-vista-leaf" size={20} aria-hidden="true" />
            <p className="min-w-0 flex-1 truncate text-sm font-extrabold">{user.displayName}님으로 예약합니다</p>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="shrink-0 rounded-md border border-[#bfd0bc] bg-white px-3 py-2 text-xs font-extrabold"
            >
              로그아웃
            </button>
          </>
        ) : (
          <>
            <p className="min-w-0 flex-1 text-[11px] font-bold leading-4 text-[#5f6e61]">
              이름 자동입력 · 예약 관리
              <br />
              로그인 없이도 예약 가능
            </p>
            <button
              type="button"
              onClick={() => handleLogin("kakao")}
              disabled={pendingProvider !== null}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-[#e4cf2d] bg-[#fee500] px-4 text-sm font-extrabold text-[#191600] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {pendingProvider ? <Loader2 className="animate-spin" size={17} aria-hidden="true" /> : null}
              카카오 로그인
            </button>
          </>
        )}
      </div>

      {message ? <p className="mt-2 text-xs font-bold text-[#5f6e61]">{message}</p> : null}
    </section>
  );
}
