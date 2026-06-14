import { Trophy } from "lucide-react";

const rows = [
  { rank: 1, nickname: "서진", phone: "010-****-2001", store: "비스타파크골프 시흥점", best: 51, rounds: 8 },
  { rank: 2, nickname: "도윤", phone: "010-****-2002", store: "비스타파크골프 시흥점", best: 53, rounds: 6 },
  { rank: 3, nickname: "지우", phone: "010-****-2003", store: "비스타파크골프 시흥점", best: 54, rounds: 5 }
];

export default function RankingsPage() {
  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <section className="rounded-md border border-[#dfe8dc] bg-white p-6 shadow-soft-line">
          <div className="flex items-start gap-4">
            <div className="grid size-14 shrink-0 place-items-center rounded-md bg-vista-leaf text-white">
              <Trophy size={28} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-bold text-vista-leaf">rankings · monthly_store_rankings 뷰 연결 준비</p>
              <h1 className="mt-1 text-3xl font-extrabold">랭킹</h1>
              <p className="mt-2 text-sm text-[#697468]">
                매장별 월간 베스트 스코어를 자동 계산한 결과 예시입니다.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-md border border-[#dfe8dc] bg-white shadow-soft-line">
          <div className="border-b border-[#e5ece1] p-5">
            <h2 className="text-lg font-extrabold">2026년 6월 · 비스타파크골프 시흥점</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-vista-fairway text-[#566153]">
                <tr>
                  <th className="px-5 py-3">순위</th>
                  <th className="px-5 py-3">닉네임</th>
                  <th className="px-5 py-3">마스킹 전화번호</th>
                  <th className="px-5 py-3">매장</th>
                  <th className="px-5 py-3">베스트</th>
                  <th className="px-5 py-3">라운드</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf2ea]">
                {rows.map((row) => (
                  <tr key={row.rank}>
                    <td className="px-5 py-4 font-extrabold">{row.rank}</td>
                    <td className="px-5 py-4">{row.nickname}</td>
                    <td className="px-5 py-4">{row.phone}</td>
                    <td className="px-5 py-4">{row.store}</td>
                    <td className="px-5 py-4 font-extrabold">{row.best}</td>
                    <td className="px-5 py-4">{row.rounds}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
