import { AutomationClient } from "./automation-client";
import { getAdminContext } from "@/lib/admin-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AutomationPage() {
  const context = await getAdminContext();
  return <AutomationClient key={context.storeId} storeId={context.storeId} />;
}
