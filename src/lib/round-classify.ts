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

export function classifyRound(input: RoundClassificationInput): RoundClassification {
  if (input.status === "open") return { completion: "open", countedGames: 0 };
  if (input.kind === "practice") return { completion: "practice", countedGames: 0 };
  if (input.holeSource !== "native_log" || input.runs.length === 0) {
    return { completion: "unverified", countedGames: 0 };
  }

  const countedGames = input.runs.filter((run) => countBits(run.endedMask) >= MIN_HOLES_FOR_GAME).length;
  return {
    completion: countedGames > 0 ? "counted" : "partial",
    countedGames
  };
}
