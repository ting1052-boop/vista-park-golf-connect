export const GAME_STATES = ["unknown", "not_running", "menu", "playing", "paused", "results"] as const;
export const ROUND_STATUSES = ["unknown", "not_started", "in_progress", "completed"] as const;
export const GAME_STATE_SOURCES = [
  "none",
  "process",
  "vendor_api",
  "log",
  "state_file",
  "window_title",
  "uia",
  "ocr",
  "mixed"
] as const;
export const GAME_CONFIDENCE_LEVELS = ["unknown", "low", "medium", "high"] as const;
export const GAME_REASON_CODES = [
  "unsupported",
  "unconfigured",
  "timeout",
  "process_query_failed",
  "stale",
  "conflict",
  "capture_unavailable",
  "unrecognized_format",
  "process_only",
  "round_exit_unclassified"
] as const;

export type GameState = (typeof GAME_STATES)[number];
export type RoundStatus = (typeof ROUND_STATUSES)[number];
export type GameStateSource = (typeof GAME_STATE_SOURCES)[number];
export type GameConfidence = (typeof GAME_CONFIDENCE_LEVELS)[number];
export type GameReasonCode = (typeof GAME_REASON_CODES)[number];

export type GameTelemetry = {
  schemaVersion: 1;
  sampleSequence: number;
  monitorInstanceId: string;
  gameRunning: boolean | null;
  gameState: GameState;
  currentHole: number | null;
  roundStatus: RoundStatus;
  stateSource: GameStateSource;
  confidence: GameConfidence;
  observedAt: string;
  reasonCode: GameReasonCode | null;
  detectorVersion: string;
};

const MAX_MONITOR_ID_LENGTH = 80;
const MAX_DETECTOR_VERSION_LENGTH = 80;
const MAX_FUTURE_SKEW_MS = 5 * 60_000;

function isOneOf<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value as T[number]);
}

function safeText(value: unknown, maxLength: number) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength ? value : null;
}

export function normalizeGameTelemetry(value: unknown, now = new Date()): GameTelemetry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const raw = value as Record<string, unknown>;
  const monitorInstanceId = safeText(raw.monitorInstanceId, MAX_MONITOR_ID_LENGTH);
  const detectorVersion = safeText(raw.detectorVersion, MAX_DETECTOR_VERSION_LENGTH);
  const observedMs = typeof raw.observedAt === "string" ? Date.parse(raw.observedAt) : Number.NaN;
  const gameRunning = raw.gameRunning === null || typeof raw.gameRunning === "boolean" ? raw.gameRunning : undefined;

  if (
    raw.schemaVersion !== 1 ||
    !Number.isSafeInteger(raw.sampleSequence) ||
    Number(raw.sampleSequence) < 0 ||
    !monitorInstanceId ||
    !detectorVersion ||
    gameRunning === undefined ||
    !isOneOf(GAME_STATES, raw.gameState) ||
    !isOneOf(ROUND_STATUSES, raw.roundStatus) ||
    !isOneOf(GAME_STATE_SOURCES, raw.stateSource) ||
    !isOneOf(GAME_CONFIDENCE_LEVELS, raw.confidence) ||
    !(raw.reasonCode === null || isOneOf(GAME_REASON_CODES, raw.reasonCode)) ||
    !Number.isFinite(observedMs) ||
    observedMs > now.getTime() + MAX_FUTURE_SKEW_MS
  ) {
    return null;
  }

  const currentHole =
    raw.currentHole === null ||
    (Number.isSafeInteger(raw.currentHole) && Number(raw.currentHole) >= 1 && Number(raw.currentHole) <= 99)
      ? (raw.currentHole as number | null)
      : undefined;
  if (currentHole === undefined) return null;

  if (gameRunning === false && (raw.gameState !== "not_running" || raw.roundStatus !== "not_started" || currentHole !== null)) {
    return null;
  }

  return {
    schemaVersion: 1,
    sampleSequence: Number(raw.sampleSequence),
    monitorInstanceId,
    gameRunning,
    gameState: raw.gameState,
    currentHole,
    roundStatus: raw.roundStatus,
    stateSource: raw.stateSource,
    confidence: raw.confidence,
    observedAt: new Date(observedMs).toISOString(),
    reasonCode: raw.reasonCode,
    detectorVersion
  };
}

export function isGameTelemetryNewer(current: GameTelemetry | null, incoming: GameTelemetry) {
  if (!current) return true;
  if (current.monitorInstanceId === incoming.monitorInstanceId) {
    return incoming.sampleSequence > current.sampleSequence;
  }
  return Date.parse(incoming.observedAt) > Date.parse(current.observedAt);
}
