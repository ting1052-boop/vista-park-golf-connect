import { ClipboardList, PlayCircle } from "lucide-react";
import { ScoreEntryDemo } from "@/components/score-entry-demo";

export default function GamesPage() {
  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <section className="rounded-md border border-[#dfe8dc] bg-white p-6 shadow-soft-line">
          <div className="flex items-start gap-4">
            <div className="grid size-14 shrink-0 place-items-center rounded-md bg-vista-leaf text-white">
              <ClipboardList size={28} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-bold text-vista-leaf">games · game_players · scores 연결 준비</p>
              <h1 className="mt-1 text-3xl font-extrabold">경기기록</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#697468]">
                1차에서는 게임 내부 자동 연동 없이 관리자 화면에서 경기 접수와 1~18홀 수기 스코어 입력을 검증합니다.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[360px_1fr]">
          <article className="rounded-md border border-[#dfe8dc] bg-white p-5 shadow-soft-line">
            <h2 className="text-lg font-extrabold">경기 접수</h2>
            <div className="mt-4 grid gap-3 text-sm font-bold">
              <label className="grid gap-1">
                매장
                <input className="rounded-md border border-[#cad8c6] px-3 py-3" defaultValue="비스타파크골프 시흥점" />
              </label>
              <label className="grid gap-1">
                타석
                <input className="rounded-md border border-[#cad8c6] px-3 py-3" defaultValue="A-02" />
              </label>
              <label className="grid gap-1">
                참가 구분
                <input className="rounded-md border border-[#cad8c6] px-3 py-3" defaultValue="회원 앱 예약 / 현장 접수" />
              </label>
            </div>
            <button
              type="button"
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-vista-leaf px-4 py-3 text-sm font-extrabold text-white"
            >
              <PlayCircle size={18} aria-hidden="true" />
              Mock 경기 접수
            </button>
          </article>

          <ScoreEntryDemo />
        </section>
      </div>
    </div>
  );
}
