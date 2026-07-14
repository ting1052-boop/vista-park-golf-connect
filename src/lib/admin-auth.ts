import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function requireAdminUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("관리자 로그인이 필요합니다.");
  }

  return user;
}
