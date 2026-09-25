import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin-shell";
import { getOptionalAdminContext, listAdminStores } from "@/lib/admin-context";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const adminContext = await getOptionalAdminContext();
  const stores = adminContext ? await listAdminStores(adminContext) : [];
  return (
    <AdminShell adminContext={adminContext} stores={stores}>
      {children}
    </AdminShell>
  );
}
