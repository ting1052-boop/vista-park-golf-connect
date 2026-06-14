import { FileText } from "lucide-react";

const reportHtml =
  "<article><h1>비스타파크골프 시흥점 예약 현황</h1><p>오늘 예약 38건</p><p>운영 타석 15개</p><p>승인 대기 7건</p><p>노쇼 주의 회원 9명</p></article>";

export default function ReportsPage() {
  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <section className="rounded-md border border-[#dfe8dc] bg-white p-6 shadow-soft-line">
          <div className="flex items-start gap-4">
            <div className="grid size-14 shrink-0 place-items-center rounded-md bg-vista-leaf text-white">
              <FileText size={28} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-bold text-vista-leaf">reports 테이블 연결 준비</p>
              <h1 className="mt-1 text-3xl font-extrabold">운영 리포트</h1>
              <p className="mt-2 text-sm leading-6 text-[#697468]">
                일별 예약 현황, 타석 운영 상태, 예약 경로, 노쇼 현황을 HTML 리포트로 출력합니다.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[360px_1fr]">
          <article className="rounded-md border border-[#dfe8dc] bg-white p-5 shadow-soft-line">
            <h2 className="text-lg font-extrabold">HTML 리포트 생성</h2>
            <p className="mt-2 text-sm leading-6 text-[#697468]">
              현재는 샘플 HTML을 화면에 출력합니다. 실제 DB 연결 후 reports.html_snapshot에 저장합니다.
            </p>
            <button type="button" className="mt-4 w-full rounded-md bg-vista-leaf px-4 py-3 text-sm font-extrabold text-white">
              HTML 출력
            </button>
          </article>
          <article className="rounded-md border border-[#dfe8dc] bg-white p-5 shadow-soft-line">
            <h2 className="text-lg font-extrabold">미리보기</h2>
            <div className="mt-4 overflow-x-auto rounded-md bg-vista-fairway p-4 font-mono text-sm text-[#384437]">
              {reportHtml}
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}
