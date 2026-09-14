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

// 카카오는 개발자 콘솔에 설정하지 않은 동의항목을 요청하면 KOE205 로 거절한다.
// Supabase 기본값은 이메일까지 요청하므로, 실제로 켜 둔 항목만 명시한다.
// 예약에는 닉네임만 쓰고 이메일은 쓰지 않는다. 콘솔에서 동의항목을 늘리면
// 여기에도 함께 추가해야 한다.
const KAKAO_SCOPES = "profile_nickname";

export async function signInWithMemberProvider(provider: MemberSocialProvider) {
  const supabase = createBrowserSupabaseClient();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "kakao",
    options: {
      redirectTo: getRedirectTo(),
      scopes: KAKAO_SCOPES
    }
  });

  if (error) {
    throw new Error(`${providerLabels[provider]} 로그인 연결에 실패했습니다. Supabase Auth 설정을 확인해주세요.`);
  }
}
