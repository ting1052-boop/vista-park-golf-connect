import { UserRoundPlus } from "lucide-react";
import { JoinManagementDemo } from "@/components/join-management-demo";

export default function JoinPage() {
  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <section className="rounded-md border border-[#dfe8dc] bg-white p-6 shadow-soft-line">
          <div className="flex items-start gap-4">
            <div className="grid size-14 shrink-0 place-items-center rounded-md bg-vista-leaf text-white">
              <UserRoundPlus size={28} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-bold text-vista-leaf">join_posts · join_applications 연결 준비</p>
              <h1 className="mt-1 text-3xl font-extrabold">조인모집</h1>
              <p className="mt-2 text-sm text-[#697468]">
                조인 모집글 등록, 참가 신청 확인, 모집 마감 처리를 검증합니다.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-md border border-[#dfe8dc] bg-[#fbfcfa] p-5 shadow-soft-line">
          <JoinManagementDemo />
        </section>
      </div>
    </div>
  );
}
