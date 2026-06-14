"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("회원 로그인 정보를 확인하고 있습니다.");

  const nextPath = useMemo(() => {
    const next = searchParams.get("next");
    return next?.startsWith("/") ? next : "/member/app";
  }, [searchParams]);

  useEffect(() => {
    async function finishLogin() {
      const code = searchParams.get("code");

      if (!code) {
        router.replace(nextPath);
        return;
      }

      try {
        const supabase = createBrowserSupabaseClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          setMessage("로그인 세션 저장에 실패했습니다. Supabase Auth 설정을 확인해 주세요.");
          return;
        }

        router.replace(nextPath);
      } catch {
        setMessage("Supabase 환경변수가 설정되어 있지 않아 로그인을 완료할 수 없습니다.");
      }
    }

    finishLogin();
  }, [nextPath, router, searchParams]);

  return (
    <main className="grid min-h-screen place-items-center bg-[#eef2ec] px-4 text-vista-ink">
      <section className="w-full max-w-sm rounded-md border border-[#dce7d8] bg-white p-6 text-center shadow-soft-line">
        <Loader2 className="mx-auto animate-spin text-vista-leaf" size={34} aria-hidden="true" />
        <p className="mt-4 text-sm font-bold text-vista-leaf">VISTA Park Golf Connect</p>
        <h1 className="mt-2 text-2xl font-extrabold">회원 로그인 처리</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-[#687568]">{message}</p>
      </section>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center bg-[#eef2ec] px-4 text-vista-ink">
          <section className="w-full max-w-sm rounded-md border border-[#dce7d8] bg-white p-6 text-center shadow-soft-line">
            <Loader2 className="mx-auto animate-spin text-vista-leaf" size={34} aria-hidden="true" />
            <p className="mt-4 text-sm font-bold text-vista-leaf">VISTA Park Golf Connect</p>
            <h1 className="mt-2 text-2xl font-extrabold">회원 로그인 처리</h1>
            <p className="mt-3 text-sm font-semibold leading-6 text-[#687568]">회원 로그인 정보를 확인하고 있습니다.</p>
          </section>
        </main>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
