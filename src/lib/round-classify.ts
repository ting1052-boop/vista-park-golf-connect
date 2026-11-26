export const MIN_HOLES_FOR_GAME = 9;

export type RoundHoleRun = {
  enteredMask: number;
  endedMask: number;
};

export type RoundClassificationInput = {
  status: "open" | "closed";
  kind: "course" | "practice";
  holeSource: "none" | "native_log" | "ocr";
  runs: RoundHoleRun[];
};

export type RoundClassification = {
  completion: "open" | "counted" | "partial" | "unverified" | "practice";
  countedGames: number;
};

function countBits(value: number) {
  let bits = value >>> 0;
  let count = 0;
  while (bits !== 0) {
    bits &= bits - 1;
    count++;
  }
  return count;
}

/**
 * 한 묶음의 홀 수 (사용자 확정 2026-11-26).
 * - progressedHoles(진행한 홀): 다음 홀로 넘어간 홀(건너뛴 홀 포함) + 마지막 홀을 홀아웃했으면 그 홀
 * - holedOutHoles(직접 끝낸 홀): IsEndedHole State 1 이 나온 홀
 * ponytail: "마지막으로 들어간 홀" = 가장 높은 비트로 본다(실측은 1→18 순서). 역순·중간 시작 코스가 나오면
 * Agent 가 마지막 홀 번호를 따로 보내도록 바꾼다.
 */
export function holeCounts(run: RoundHoleRun) {
  const entered = run.enteredMask >>> 0;
  const lastEntered = entered === 0 ? 0 : 2 ** (31 - Math.clz32(entered));
  return {
    progressedHoles: countBits((entered & ~lastEntered) | (run.endedMask & entered)),
    holedOutHoles: countBits(run.endedMask)
  };
}

export function classifyRound(input: RoundClassificationInput): RoundClassification {
  if (input.status === "open") return { completion: "open", countedGames: 0 };
  if (input.kind === "practice") return { completion: "practice", countedGames: 0 };
  if (input.holeSource !== "native_log" || input.runs.length === 0) {
    return { completion: "unverified", countedGames: 0 };
  }

  // 9홀 이상 "진행한" 묶음 = 1회. 18홀도 1회, 9홀 미만 묶음 둘을 합치지 않는다.
  const countedGames = input.runs.filter((run) => holeCounts(run).progressedHoles >= MIN_HOLES_FOR_GAME).length;
  return {
    completion: countedGames > 0 ? "counted" : "partial",
    countedGames
  };
}
