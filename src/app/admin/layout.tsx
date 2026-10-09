import type { ReactNode } from "react";
import type { Metadata } from "next";
import { AdminShell } from "@/components/admin-shell";
import { getOptionalAdminContext, listAdminStores } from "@/lib/admin-context";

export const metadata: Metadata = {
  applicationName: "VISTA 매장관리",
  manifest: "/admin-manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "VISTA 매장관리" }
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const adminContext = await getOptionalAdminContext();
  const stores = adminContext ? await listAdminStores(adminContext) : [];
  return (
    <AdminShell adminContext={adminContext} stores={stores}>
      {children}
    </AdminShell>
  );
}
