"use client";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export type MemberSocialProvider = "kakao";

const providerLabels: Record<MemberSocialProvider, string> = {
  kakao: "카카오"
};

function getRedirectTo() {
  const next = encodeURIComponent("/member/app");
  return `${window.location.origin}/auth/callback?next=${next}`;
}

export async function signInWithMemberProvider(provider: MemberSocialProvider) {
  const supabase = createBrowserSupabaseClient();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "kakao",
    options: {
      redirectTo: getRedirectTo()
    }
  });

  if (error) {
    throw new Error(`${providerLabels[provider]} 로그인 연결에 실패했습니다. Supabase Auth 설정을 확인해주세요.`);
  }
}
