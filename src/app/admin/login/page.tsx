"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, LockKeyhole, Mail } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError("이메일과 비밀번호를 입력해주세요.");
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (signInError) {
        setError(signInError.message === "Invalid login credentials" ? "이메일 또는 비밀번호가 올바르지 않습니다." : signInError.message);
        setIsLoading(false);
        return;
      }

      const nextPath = searchParams.get("next");
      const target = nextPath && nextPath.startsWith("/admin") ? nextPath : "/admin/dashboard";
      router.replace(target);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "로그인에 실패했습니다.");
      setIsLoading(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-[#eef2ec] px-4 text-vista-ink">
      <div className="w-full max-w-sm rounded-[28px] border border-[#d9e3d5] bg-white p-6 shadow-soft-line">
        <div className="flex items-center gap-3 border-b border-[#e5ece1] pb-5">
          <span className="grid size-12 place-items-center rounded-md bg-vista-leaf text-white">
            <LockKeyhole size={24} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-bold text-vista-leaf">VISTA Park Golf Connect</p>
            <h1 className="mt-1 text-xl font-extrabold">관리자 로그인</h1>
          </div>
        </div>

        <form onSubmit={handleLogin} className="mt-5 grid gap-3">
          <label className="grid gap-1 text-sm font-bold text-[#4f5b50]">
            이메일
            <div className="flex items-center gap-2 rounded-md border border-[#cad8c6] bg-[#fbfcfa] px-3 py-3">
              <Mail size={18} className="text-[#697468]" aria-hidden="true" />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full bg-transparent font-semibold outline-none"
                placeholder="admin@example.com"
                autoComplete="username"
              />
            </div>
          </label>

          <label className="grid gap-1 text-sm font-bold text-[#4f5b50]">
            비밀번호
            <div className="flex items-center gap-2 rounded-md border border-[#cad8c6] bg-[#fbfcfa] px-3 py-3">
              <LockKeyhole size={18} className="text-[#697468]" aria-hidden="true" />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full bg-transparent font-semibold outline-none"
                placeholder="비밀번호"
                autoComplete="current-password"
              />
            </div>
          </label>

          {error ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={isLoading}
            className="mt-1 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-md bg-vista-leaf px-4 py-3 text-base font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? <Loader2 className="animate-spin" size={20} aria-hidden="true" /> : null}
            로그인
          </button>
        </form>

        <p className="mt-4 text-xs font-semibold leading-5 text-[#697468]">
          관리자 계정은 본사에서 발급합니다. 계정이 필요하면 본사 운영팀에 문의해주세요.
        </p>
      </div>
    </main>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginForm />
    </Suspense>
  );
}
