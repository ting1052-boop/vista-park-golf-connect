import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { requireAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const DEFAULT_STORE_ID = "11111111-1111-4111-8111-111111111111";
// 본사관리자가 고른 매장을 담는 쿠키. head_admin 일 때만 읽는다.
export const HEAD_STORE_COOKIE = "vista_admin_store";

export type AdminContext = {
  userId: string;
  storeId: string;
  storeName: string;
  roleLabel: string;
  limitedMenu: boolean;
  isHeadAdmin: boolean;
};

type UserRoleRow = { role: string | null };
type StoreAssignmentRow = { store_id: string; role: string | null };
type StoreRow = { id: string; name: string };

type AdminRole = "head_admin" | "store_manager" | "staff";

// 역할이 없으면 관리자가 아니다. 로그인만으로 본사관리자로 취급하지 않는다.
// 고객 카카오 로그인도 같은 Supabase 계정 체계를 쓰기 때문이다.
export function isAdminRole(role: string | null | undefined): role is AdminRole {
  return role === "head_admin" || role === "store_manager" || role === "staff";
}

function metadataString(user: User, key: string) {
  const value = user.app_metadata?.[key] ?? user.user_metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function readHeadStoreCookie(): Promise<string | null> {
  try {
    const store = (await cookies()).get(HEAD_STORE_COOKIE)?.value?.trim();
    return store && store.length > 0 ? store : null;
  } catch {
    // cookies() is unavailable outside a request scope (e.g. build). Ignore.
    return null;
  }
}

export async function getAdminContext(): Promise<AdminContext> {
  const user = await requireAdminUser();
  const supabase = createSupabaseAdminClient();

  // public.users 가 권한의 근거다. 조회 실패는 기본 거부(throw)한다.
  const { data: userRow, error: userError } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (userError) {
    throw new Error(`관리자 권한을 확인하지 못했습니다: ${userError.message}`);
  }

  let role: string | null = (userRow as UserRoleRow | null)?.role ?? metadataString(user, "role");
  let assignedStoreId: string | null = null;

  if (role === "store_manager" || role === "staff") {
    const { data: assignment } = await supabase
      .from("store_users")
      .select("store_id, role")
      .eq("user_id", user.id)
      .order("assigned_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const assigned = assignment as StoreAssignmentRow | null;
    assignedStoreId = assigned?.store_id ?? null;
    role = assigned?.role ?? role;
  }

  if (!isAdminRole(role)) {
    throw new Error("관리자 권한이 없습니다.");
  }

  const isHeadAdmin = role === "head_admin";
  const limitedMenu = role === "store_manager" || role === "staff";

  // 본사관리자만 매장을 고를 수 있다. 쿠키의 매장 ID 는 실제 존재하는지 확인한다.
  // 매장관리자는 쿠키를 무시하고 배정된 매장만 본다.
  let storeId = assignedStoreId ?? DEFAULT_STORE_ID;
  if (isHeadAdmin) {
    const requested = await readHeadStoreCookie();
    if (requested) {
      const { data: exists } = await supabase
        .from("stores")
        .select("id")
        .eq("id", requested)
        .maybeSingle();
      if (exists) storeId = requested;
    }
  }

  const { data: store } = await supabase.from("stores").select("id, name").eq("id", storeId).maybeSingle();
  const storeName = (store as StoreRow | null)?.name ?? metadataString(user, "store_name");

  return {
    userId: user.id,
    storeId,
    storeName: storeName ?? "비스타파크골프 시흥점",
    roleLabel: limitedMenu ? "매장관리자" : "본사관리자",
    limitedMenu,
    isHeadAdmin
  };
}

export async function getOptionalAdminContext() {
  try {
    return await getAdminContext();
  } catch {
    return null;
  }
}
