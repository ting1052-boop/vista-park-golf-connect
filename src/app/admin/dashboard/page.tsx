import { liveBayRows } from "@/lib/dashboard-data";
import { getBays } from "@/lib/supabase/bays";
import { DashboardClient } from "./dashboard-client";

export default async function AdminDashboardPage() {
  try {
    const bays = await getBays();

    return <DashboardClient initialBays={bays.length > 0 ? bays : liveBayRows} initialError={null} />;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supabase 타석 데이터를 불러오지 못했습니다.";

    return <DashboardClient initialBays={liveBayRows} initialError={message} />;
  }
}
