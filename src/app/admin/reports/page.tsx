import { FileText } from "lucide-react";
import { getOptionalAdminContext } from "@/lib/admin-context";
import { RoundCountReport } from "./round-count-report";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  // 매장을 바꾸면(router.refresh) key 가 바뀌어 표를 다시 불러온다.
  const storeId = (await getOptionalAdminContext())?.storeId ?? "none";
  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <section className="rounded-md border border-[#dfe8dc] bg-white p-6 shadow-soft-line">
          <div className="flex items-start gap-4">
            <div className="grid size-14 shrink-0 place-items-center rounded-md bg-vista-leaf text-white">
              <FileText size={28} aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold">운영 리포트</h1>
              <p className="mt-2 text-sm leading-6 text-[#697468]">선택한 매장의 타석별 게임 수를 날짜별로 확인합니다.</p>
            </div>
          </div>
        </section>

        <div className="mt-5">
          <RoundCountReport key={storeId} />
        </div>
      </div>
    </div>
  );
}
