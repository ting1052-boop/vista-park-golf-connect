import { Medal } from "lucide-react";

const results = [
  { rank: 1, nickname: "서진", score: 51 },
  { rank: 2, nickname: "도윤", score: 54 },
  { rank: 3, nickname: "지우", score: 57 }
];

export default function TournamentsPage() {
  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <section className="rounded-md border border-[#dfe8dc] bg-white p-6 shadow-soft-line">
          <div className="flex items-start gap-4">
            <div className="grid size-14 shrink-0 place-items-center rounded-md bg-vista-leaf text-white">
              <Medal size={28} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-bold text-vista-leaf">tournaments · tournament_entries 연결 준비</p>
              <h1 className="mt-1 text-3xl font-extrabold">대회운영</h1>
              <p className="mt-2 text-sm text-[#697468]">
                대회 생성, 참가자 등록, 대회 결과표 생성을 확인합니다.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[360px_1fr]">
          <article className="rounded-md border border-[#dfe8dc] bg-white p-5 shadow-soft-line">
            <h2 className="text-lg font-extrabold">대회 생성</h2>
            <div className="mt-4 grid gap-3 text-sm font-bold">
              <input className="rounded-md border border-[#cad8c6] px-3 py-3" defaultValue="6월 매장별 정기전" />
              <input className="rounded-md border border-[#cad8c6] px-3 py-3" defaultValue="비스타파크골프 시흥점" />
              <input className="rounded-md border border-[#cad8c6] px-3 py-3" defaultValue="정원 64명" />
            </div>
            <button type="button" className="mt-4 w-full rounded-md bg-vista-leaf px-4 py-3 text-sm font-extrabold text-white">
              Mock 대회 생성
            </button>
          </article>
          <article className="rounded-md border border-[#dfe8dc] bg-white shadow-soft-line">
            <div className="border-b border-[#e5ece1] p-5">
              <h2 className="text-lg font-extrabold">대회 결과표</h2>
            </div>
            <div className="divide-y divide-[#edf2ea]">
              {results.map((row) => (
                <div key={row.rank} className="flex items-center justify-between px-5 py-4">
                  <span className="font-extrabold">
                    {row.rank}위 · {row.nickname}
                  </span>
                  <span className="text-lg font-extrabold text-vista-leaf">{row.score}타</span>
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}
