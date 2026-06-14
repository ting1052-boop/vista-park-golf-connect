"use client";

import { useMemo, useState } from "react";

const initialScores = Array.from({ length: 18 }, () => 3);

export function ScoreEntryDemo() {
  const [scores, setScores] = useState(initialScores);
  const total = useMemo(() => scores.reduce((sum, score) => sum + score, 0), [scores]);
  const toPar = total - 54;

  return (
    <section className="rounded-md border border-[#dfe8dc] bg-white p-5 shadow-soft-line">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-extrabold">1~18홀 스코어 입력</h2>
          <p className="mt-1 text-sm text-[#697468]">각 홀 점수를 변경하면 총점이 자동 계산됩니다.</p>
        </div>
        <div className="rounded-md bg-vista-fairway px-4 py-3 text-sm font-extrabold text-vista-leaf">
          총점 {total}타 · {toPar > 0 ? `+${toPar}` : toPar}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {scores.map((score, index) => (
          <label key={index} className="rounded-md border border-[#e5ece1] bg-[#fbfcfa] p-3 text-sm font-bold">
            {index + 1}홀
            <input
              type="number"
              min={1}
              max={20}
              value={score}
              onChange={(event) => {
                const value = Number(event.target.value);
                setScores((current) => current.map((item, itemIndex) => (itemIndex === index ? value : item)));
              }}
              className="mt-2 w-full rounded-md border border-[#cad8c6] bg-white px-3 py-2 text-center text-lg font-extrabold outline-none focus:border-vista-leaf"
            />
          </label>
        ))}
      </div>
    </section>
  );
}
