import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin-shell";
import { getOptionalAdminContext } from "@/lib/admin-context";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const adminContext = await getOptionalAdminContext();
  return <AdminShell adminContext={adminContext}>{children}</AdminShell>;
}
