import type { User } from "@supabase/supabase-js";
import { requireAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const DEFAULT_STORE_ID = "11111111-1111-4111-8111-111111111111";

export type AdminContext = {
  userId: string;
  storeId: string;
  storeName: string;
  roleLabel: string;
  limitedMenu: boolean;
};

type UserRoleRow = { role: string | null };
type StoreAssignmentRow = { store_id: string; role: string | null };
type StoreRow = { id: string; name: string };

function metadataString(user: User, key: string) {
  const value = user.app_metadata?.[key] ?? user.user_metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function getAdminContext(): Promise<AdminContext> {
  const user = await requireAdminUser();
  const metadataRole = metadataString(user, "role");
  const metadataStoreId = metadataString(user, "store_id");
  const metadataStoreName = metadataString(user, "store_name");

  let role = metadataRole;
  let storeId = metadataStoreId;
  let storeName = metadataStoreName;

  try {
    const supabase = createSupabaseAdminClient();
    const { data: userRow } = await supabase.from("users").select("role").eq("id", user.id).maybeSingle();
    role = (userRow as UserRoleRow | null)?.role ?? role;

    if (role !== "head_admin") {
      const { data: assignment } = await supabase
        .from("store_users")
        .select("store_id, role")
        .eq("user_id", user.id)
        .order("assigned_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      const assigned = assignment as StoreAssignmentRow | null;
      storeId = assigned?.store_id ?? storeId;
      role = assigned?.role ?? role;
    }

    const resolvedStoreId = storeId ?? DEFAULT_STORE_ID;
    const { data: store } = await supabase.from("stores").select("id, name").eq("id", resolvedStoreId).maybeSingle();
    storeName = (store as StoreRow | null)?.name ?? storeName;
  } catch {
    // Older deployments may not yet have the role tables. Metadata and the
    // existing Siheung default keep current administrators operational.
  }

  const limitedMenu = role === "store_manager" || role === "staff";
  return {
    userId: user.id,
    storeId: storeId ?? DEFAULT_STORE_ID,
    storeName: storeName ?? "비스타파크골프 시흥점",
    roleLabel: limitedMenu ? "매장관리자" : "본사관리자",
    limitedMenu
  };
}

export async function getOptionalAdminContext() {
  try {
    return await getAdminContext();
  } catch {
    return null;
  }
}
