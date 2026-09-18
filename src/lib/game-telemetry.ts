export const GAME_STATES = [
  "unknown", "not_running", "menu", "playing", "practice", "exiting", "paused", "results"
] as const;
export const GAME_MODES = ["unknown", "none", "lobby", "regular", "practice", "excluded"] as const;
export const ROUND_STATUSES = [
  "unknown", "not_started", "in_progress", "completed", "ended_unclassified", "aborted", "not_applicable"
] as const;
export const HOLE_STATUSES = ["unknown", "confirmed", "transitioning", "stale", "not_applicable", "conflict"] as const;
export const GAME_STATE_SOURCES = [
  "none", "process", "vendor_api", "log", "state_file", "window_title", "uia", "ocr", "mixed"
] as const;
export const GAME_CONFIDENCE_LEVELS = ["unknown", "low", "medium", "high"] as const;
export const GAME_REASON_CODES = [
  "unsupported", "unconfigured", "timeout", "process_query_failed", "stale", "conflict",
  "capture_unavailable", "unrecognized_format", "process_only", "round_exit_unclassified",
  "practice_map", "excluded_map", "course_unclassified", "returned_to_lobby", "exit_during_round",
  "recognition_pending", "recognition_rejected", "recognition_ambiguous", "recognition_timeout",
  "recognition_failed", "source_stale", "capture_source_not_found", "capture_source_ambiguous",
  "layout_unconfigured", "clock_skew"
] as const;

export type GameState = (typeof GAME_STATES)[number];
export type GameMode = (typeof GAME_MODES)[number];
export type RoundStatus = (typeof ROUND_STATUSES)[number];
export type HoleStatus = (typeof HOLE_STATUSES)[number];
export type GameStateSource = (typeof GAME_STATE_SOURCES)[number];
export type GameConfidence = (typeof GAME_CONFIDENCE_LEVELS)[number];
export type GameReasonCode = (typeof GAME_REASON_CODES)[number];

export type GameTelemetry = {
  schemaVersion: 1 | 2;
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
  gameMode?: GameMode;
  courseId?: string | null;
  roundId?: string | null;
  gameInstanceId?: string | null;
  contextEpoch?: number;
  holeStatus?: HoleStatus;
  holeSource?: "ocr" | null;
  holeObservedAt?: string | null;
  lastKnownHole?: number | null;
  lastKnownHoleAt?: string | null;
  layoutVersion?: string | null;
};

const MAX_MONITOR_ID_LENGTH = 80;
const MAX_DETECTOR_VERSION_LENGTH = 80;
const MAX_TEXT_LENGTH = 128;
const MAX_FUTURE_SKEW_MS = 5 * 60_000;

function isOneOf<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value as T[number]);
}

function safeText(value: unknown, maxLength: number) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength ? value : null;
}

function nullableText(value: unknown, maxLength = MAX_TEXT_LENGTH) {
  return value === null || value === undefined ? null : safeText(value, maxLength);
}

function nullableIso(value: unknown, now: Date) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined;
  const millis = Date.parse(value);
  if (!Number.isFinite(millis) || millis > now.getTime() + MAX_FUTURE_SKEW_MS) return undefined;
  return new Date(millis).toISOString();
}

function nullableHole(value: unknown, maxHole: number) {
  if (value === null || value === undefined) return null;
  return Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= maxHole ? Number(value) : undefined;
}

export function normalizeGameTelemetry(value: unknown, now = new Date()): GameTelemetry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const schemaVersion = raw.schemaVersion === 2 ? 2 : raw.schemaVersion === 1 ? 1 : null;
  const monitorInstanceId = safeText(raw.monitorInstanceId, MAX_MONITOR_ID_LENGTH);
  const detectorVersion = safeText(raw.detectorVersion, MAX_DETECTOR_VERSION_LENGTH);
  const observedMs = typeof raw.observedAt === "string" ? Date.parse(raw.observedAt) : Number.NaN;
  const gameRunning = raw.gameRunning === null || typeof raw.gameRunning === "boolean" ? raw.gameRunning : undefined;
  const currentHole = nullableHole(raw.currentHole, schemaVersion === 2 ? 18 : 99);

  if (
    schemaVersion === null || !Number.isSafeInteger(raw.sampleSequence) || Number(raw.sampleSequence) < 0 ||
    !monitorInstanceId || !detectorVersion || gameRunning === undefined || currentHole === undefined ||
    !isOneOf(GAME_STATES, raw.gameState) || !isOneOf(ROUND_STATUSES, raw.roundStatus) ||
    !isOneOf(GAME_STATE_SOURCES, raw.stateSource) || !isOneOf(GAME_CONFIDENCE_LEVELS, raw.confidence) ||
    !(raw.reasonCode === null || isOneOf(GAME_REASON_CODES, raw.reasonCode)) ||
    !Number.isFinite(observedMs) || observedMs > now.getTime() + MAX_FUTURE_SKEW_MS
  ) return null;

  if (gameRunning === false && (raw.gameState !== "not_running" || raw.roundStatus !== "not_started" || currentHole !== null)) {
    return null;
  }

  const base: GameTelemetry = {
    schemaVersion,
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
  if (schemaVersion === 1) return base;

  const gameMode = isOneOf(GAME_MODES, raw.gameMode) ? raw.gameMode : null;
  const holeStatus = isOneOf(HOLE_STATUSES, raw.holeStatus) ? raw.holeStatus : null;
  const courseId = nullableText(raw.courseId);
  const roundId = nullableText(raw.roundId, 80);
  const gameInstanceId = nullableText(raw.gameInstanceId, 80);
  const holeObservedAt = nullableIso(raw.holeObservedAt, now);
  const lastKnownHole = nullableHole(raw.lastKnownHole, 18);
  const lastKnownHoleAt = nullableIso(raw.lastKnownHoleAt, now);
  const layoutVersion = nullableText(raw.layoutVersion, 80);
  const contextEpoch = Number.isSafeInteger(raw.contextEpoch) && Number(raw.contextEpoch) >= 0 ? Number(raw.contextEpoch) : null;
  const holeSource = raw.holeSource === null || raw.holeSource === undefined ? null : raw.holeSource === "ocr" ? "ocr" : undefined;

  if (!gameMode || !holeStatus || contextEpoch === null || courseId === undefined || roundId === undefined ||
      gameInstanceId === undefined || holeObservedAt === undefined || lastKnownHole === undefined ||
      lastKnownHoleAt === undefined || layoutVersion === undefined || holeSource === undefined) return null;

  const hasConfirmedHole = currentHole !== null && gameRunning === true && raw.gameState === "playing" &&
    raw.roundStatus === "in_progress" && gameMode === "regular" && holeStatus === "confirmed" &&
    holeSource === "ocr" && holeObservedAt !== null;
  if (currentHole !== null && !hasConfirmedHole) return null;

  return {
    ...base,
    schemaVersion: 2,
    gameMode,
    courseId,
    roundId,
    gameInstanceId,
    contextEpoch,
    holeStatus,
    holeSource,
    holeObservedAt,
    lastKnownHole,
    lastKnownHoleAt,
    layoutVersion
  };
}

export function isGameTelemetryNewer(current: GameTelemetry | null, incoming: GameTelemetry) {
  if (!current) return true;
  if (current.monitorInstanceId === incoming.monitorInstanceId) return incoming.sampleSequence > current.sampleSequence;
  return Date.parse(incoming.observedAt) > Date.parse(current.observedAt);
}

export function isGameTelemetryStale(telemetry: GameTelemetry, now = new Date(), maxAgeMs = 45_000) {
  const observedAt = Date.parse(telemetry.observedAt);
  return !Number.isFinite(observedAt) || now.getTime() - observedAt > maxAgeMs;
}

export function isHoleObservationFresh(telemetry: GameTelemetry, now = new Date(), maxAgeMs = 35_000) {
  if (telemetry.schemaVersion !== 2 || telemetry.holeStatus !== "confirmed" || !telemetry.holeObservedAt) return false;
  const observedAt = Date.parse(telemetry.holeObservedAt);
  return Number.isFinite(observedAt) && now.getTime() - observedAt <= maxAgeMs;
}
