/* eslint-disable @typescript-eslint/no-require-imports */

const { app, BrowserWindow, desktopCapturer, ipcMain, screen } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { randomUUID } = require("node:crypto");
const { execFile } = require("node:child_process");
const { mergeBaysConfig } = require("./agent-config");
const { createGameLogProbe } = require("./game-log-probe");
const { createScreenGolfMonitor } = require("./screen-golf-monitor");
const { createGameLogLocator } = require("./game-log-locator");
const { createScreenHoleDetector } = require("./screen-hole-detector");
const { createRoundEventOutbox } = require("./round-event-outbox");

const ROOT = __dirname; // bundled, read-only when packaged (asar)
const BAYS_CONFIG_PATH = path.join(ROOT, "bays.config.json");
const LOCAL_BAYS_CONFIG_PATH = path.join(ROOT, "bays.config.local.json");
const VERSION = "0.9.0";

if (process.env.VISTA_AGENT_OFFLINE === "1" && process.env.VISTA_AGENT_PROFILE_DIR) {
  app.setPath("userData", path.resolve(process.env.VISTA_AGENT_PROFILE_DIR));
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

// Writable locations. In a packaged exe, ROOT is inside a read-only archive,
// so the selected bay, the local test session, and logs all live in userData.
let USER_DATA = ROOT;
let USER_CONFIG_PATH = path.join(ROOT, "agent.config.json");
let LOG_DIR = path.join(ROOT, "logs");
let ROUND_OUTBOX_PATH = path.join(ROOT, "round-event-outbox.json");

let mainWindow = null;
let setupWindow = null;
let currentMode = null;
let config = null;
let baysConfig = null;
let activeSessionId = null;
let dismissedWarningSessionId = null;
let extensionRequestState = null;
let pollTimer = null;
let endNotice = null;
let shutdownTimer = null;
const processingAgentCommandIds = new Set();
const gameMonitorInstanceId = randomUUID();
let gameSampleSequence = 0;
let gameTelemetryRefreshPromise = null;
let latestGameTelemetry = null;
let gameLogProbeTimer = null;
let gameTelemetryTimer = null;
let screenGolfMonitor = null;
let screenHoleDetector = null;
let roundEventOutbox = null;
let lastHeartbeatIssueKey = null;
let lastHeartbeatIssueLoggedAt = 0;

app.on("second-instance", () => {
  const window = setupWindow && !setupWindow.isDestroyed() ? setupWindow : mainWindow;
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
});

function nowIso() {
  return new Date().toISOString();
}

function hasAgentCredentials() {
  const token = String(config?.agentToken ?? "").trim();
  return Boolean(config?.apiBaseUrl && token && !/^(?:change-me|replace_with_)/iu.test(token));
}

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function log(message, extra = undefined) {
  ensureLogDir();
  const line = `[${nowIso()}] ${message}${extra === undefined ? "" : ` ${JSON.stringify(extra)}`}`;
  console.log(line);
  try {
    fs.appendFileSync(path.join(LOG_DIR, "vista-agent-overlay.log"), `${line}\n`, "utf8");
  } catch {
    // logging must never crash the agent
  }
}

function writeGameDiagnostic(event) {
  ensureLogDir();
  try {
    fs.appendFileSync(
      path.join(LOG_DIR, "game-monitor-diagnostics.log"),
      `${JSON.stringify({ agentVersion: VERSION, ...event })}\n`,
      "utf8"
    );
  } catch {
    // diagnostics must never interrupt the agent
  }
}

async function startGameLogDiagnostics() {
  if (gameLogProbeTimer) clearInterval(gameLogProbeTimer);
  gameLogProbeTimer = null;
  if (!config.gameLogDiagnosticsEnabled || config.gameLogDirectories.length === 0) return;

  const probe = createGameLogProbe({
    directories: config.gameLogDirectories,
    onDiagnostic: writeGameDiagnostic
  });
  await probe.scan().catch((error) => {
    writeGameDiagnostic({ event: "scan_failed", errorCode: error?.code ?? "unknown", observedAt: nowIso() });
  });
  gameLogProbeTimer = setInterval(() => {
    void probe.scan().catch((error) => {
      writeGameDiagnostic({ event: "scan_failed", errorCode: error?.code ?? "unknown", observedAt: nowIso() });
    });
  }, config.gameLogProbeIntervalSeconds * 1000);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadBaysConfig() {
  const base = readJson(BAYS_CONFIG_PATH);
  const userLocalPath = path.join(USER_DATA, "bays.config.local.json");
  if (fs.existsSync(userLocalPath)) return mergeBaysConfig(base, readJson(userLocalPath));
  if (!app.isPackaged && fs.existsSync(LOCAL_BAYS_CONFIG_PATH)) return mergeBaysConfig(base, readJson(LOCAL_BAYS_CONFIG_PATH));
  return mergeBaysConfig(base);
}

function loadMonitorOverrides() {
  const monitorPath = path.join(USER_DATA, "monitor.config.json");
  if (!fs.existsSync(monitorPath)) return {};
  try {
    const raw = readJson(monitorPath);
    const allowed = [
      "gameTelemetryIntervalSeconds", "gameHoleDetectionEnabled", "gameCaptureSourceName",
      "gameHoleRoi", "gameHoleAllowDigitsOnlyInRoi", "gameHoleConfirmationCount",
      "gameHoleSampleWindow", "gameHoleSampleWindowSeconds", "gameHoleStaleSeconds", "gameHoleLayoutVersion"
    ];
    return Object.fromEntries(allowed.filter((key) => raw[key] !== undefined).map((key) => [key, raw[key]]));
  } catch (error) {
    log("Failed to read monitor.config.json", { error: error.message });
    return {};
  }
}

// The selected bay is stored as { bayCode } in userData. We merge shared
// settings + the matching bay preset at load time, so updating shared config
// only requires a new build, never per-PC editing.
function loadConfig() {
  let selectedBayCode = null;

  if (fs.existsSync(USER_CONFIG_PATH)) {
    try {
      selectedBayCode = readJson(USER_CONFIG_PATH).bayCode ?? null;
    } catch (error) {
      log("Failed to read selected bay, will ask again", { error: error.message });
    }
  }

  const bay = baysConfig.bays.find((entry) => entry.bayCode === selectedBayCode);
  if (!bay) return null;

  const merged = { ...baysConfig.shared, ...bay, ...loadMonitorOverrides() };

  return {
    ...merged,
    pcName: merged.pcName || os.hostname(),
    sessionSource: merged.sessionSource || "local",
    sessionFile: merged.sessionFile || "agent-session.json",
    pollIntervalSeconds: Number(merged.pollIntervalSeconds || 3),
    warningBeforeMinutes: Number(merged.warningBeforeMinutes || 10),
    autoShutdownAfterEndMinutes: Math.max(0, Number(merged.autoShutdownAfterEndMinutes ?? 5)),
    criticalBeforeMinutes: Number(merged.criticalBeforeMinutes || 3),
    extensionMinutes: Number(merged.extensionMinutes || 30),
    extensionPrice: Number(merged.extensionPrice || 6000),
    offlineMode: process.env.VISTA_AGENT_OFFLINE === "1",
    gameMonitoringEnabled: merged.gameMonitoringEnabled === true,
    gameProcessNames: Array.isArray(merged.gameProcessNames) ? merged.gameProcessNames : [],
    gameStateLogFile:
      typeof merged.gameStateLogFile === "string"
        ? merged.gameStateLogFile
        : "C:\\PARK_260713-VISTA\\ScreenGolf\\Saved\\Logs\\ScreenGolf.log",
    // 게임 폴더 이름에 설치 날짜가 들어가 재설치 때마다 바뀐다. 고정 경로만 보면
    // 조용히 어긋나므로, 후보를 패턴으로 찾아 가장 최근에 쓰인 로그를 따라간다.
    gameStateLogPatterns: Array.isArray(merged.gameStateLogPatterns)
      ? merged.gameStateLogPatterns
      : ["C:\\PARK_*-VISTA\\ScreenGolf\\Saved\\Logs\\ScreenGolf.log"],
    gameLogDiagnosticsEnabled: merged.gameLogDiagnosticsEnabled !== false,
    gameLogDirectories: Array.isArray(merged.gameLogDirectories)
      ? merged.gameLogDirectories
      : ["C:\\PARK_260713-VISTA\\Launch\\Logs"],
    gameLogProbeIntervalSeconds: Math.max(5, Number(merged.gameLogProbeIntervalSeconds || 10)),
    gameTelemetryIntervalSeconds: Math.max(1, Number(merged.gameTelemetryIntervalSeconds || 2)),
    gameHoleDetectionEnabled: merged.gameHoleDetectionEnabled === true,
    gameCaptureSourceName: String(merged.gameCaptureSourceName || ""),
    gameHoleRoi: merged.gameHoleRoi && typeof merged.gameHoleRoi === "object" ? merged.gameHoleRoi : null,
    gameHoleAllowDigitsOnlyInRoi: merged.gameHoleAllowDigitsOnlyInRoi === true,
    gameHoleConfirmationCount: Math.max(2, Number(merged.gameHoleConfirmationCount || 2)),
    gameHoleSampleWindow: Math.max(2, Number(merged.gameHoleSampleWindow || 3)),
    gameHoleSampleWindowSeconds: Math.max(2, Number(merged.gameHoleSampleWindowSeconds || 6)),
    gameHoleStaleSeconds: Math.max(2, Number(merged.gameHoleStaleSeconds || 5)),
    gameHoleLayoutVersion: String(merged.gameHoleLayoutVersion || "unconfigured"),
    allowCloseWithEsc: merged.allowCloseWithEsc !== false
  };
}

function saveSelectedBay(bayCode) {
  fs.writeFileSync(USER_CONFIG_PATH, JSON.stringify({ bayCode }, null, 2), "utf8");
}

// Local test session: prefer userData (writable in packaged exe), fall back to
// the bundled example folder so pre-package dev testing still works.
function resolveSessionPath() {
  const inUserData = path.join(USER_DATA, config.sessionFile);
  if (fs.existsSync(inUserData)) return inUserData;
  return path.join(ROOT, config.sessionFile);
}

function loadLocalSession() {
  const sessionPath = resolveSessionPath();

  if (!fs.existsSync(sessionPath)) {
    return null;
  }

  try {
    const session = readJson(sessionPath);
    if (session.status !== "active" && session.status !== "extended") return null;
    if (!session.endsAt) return null;
    return session;
  } catch (error) {
    log("Failed to read local session", { error: error.message });
    return null;
  }
}

async function loadServerSession() {
  if (config.offlineMode) return null;
  if (!hasAgentCredentials()) {
    return null;
  }

  const baseUrl = String(config.apiBaseUrl).replace(/\/$/, "");
  const url = `${baseUrl}/api/agent/session?agentId=${encodeURIComponent(config.agentId)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.agentToken}`,
      "x-vista-agent-id": config.agentId,
      "x-vista-agent-version": VERSION
    }
  });

  if (!response.ok) {
    throw new Error(`session ${response.status}`);
  }

  const data = await response.json();
  for (const command of Array.isArray(data.commands) ? data.commands : []) {
    await processAgentCommand(command);
  }
  return data.session ?? null;
}

async function reportAgentCommand(commandId, ok, errorMessage = null) {
  const baseUrl = String(config.apiBaseUrl).replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/api/agent/command-result`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.agentToken}`,
      "x-vista-agent-id": config.agentId
    },
    body: JSON.stringify({ commandId, ok, error: errorMessage })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.message ?? `command result ${response.status}`);
  }
}

async function processAgentCommand(command) {
  if (!command || command.type !== "shutdown_pc" || typeof command.id !== "string") return;
  if (processingAgentCommandIds.has(command.id)) return;

  processingAgentCommandIds.add(command.id);
  try {
    await reportAgentCommand(command.id, true);
    log("Store close command accepted; Windows shutdown scheduled", { commandId: command.id });
    setTimeout(() => {
      execFile(
        "shutdown.exe",
        ["/s", "/f", "/t", "10", "/c", "VISTA 留ㅼ옣 醫낅즺: 10珥???PC瑜?醫낅즺?⑸땲??"],
        { windowsHide: true },
        (error) => {
          if (error) log("Store close PC shutdown command failed", { commandId: command.id, error: error.message });
        }
      );
    }, 500);
  } catch (error) {
    log("Store close command acknowledgement failed; shutdown cancelled", {
      commandId: command.id,
      error: error.message
    });
  } finally {
    processingAgentCommandIds.delete(command.id);
  }
}

async function loadSession() {
  if (config.sessionSource === "server") {
    try {
      return await loadServerSession();
    } catch (error) {
      log("Server session fetch failed, falling back to local session", { error: error.message });
    }
  }

  return loadLocalSession();
}

function getRemainingSeconds(session) {
  if (!session?.endsAt) return null;
  return Math.max(0, Math.floor((new Date(session.endsAt).getTime() - Date.now()) / 1000));
}

function clearEndNotice() {
  if (shutdownTimer) {
    clearTimeout(shutdownTimer);
    shutdownTimer = null;
  }

  endNotice = null;
}

async function completeExpiredSession(accessSessionId) {
  if (config.offlineMode) return;
  if (!hasAgentCredentials()) throw new Error("agent_credentials_missing");
  const baseUrl = String(config.apiBaseUrl).replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/api/agent/session/end`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.agentToken}`,
      "x-vista-agent-id": config.agentId
    },
    body: JSON.stringify({ accessSessionId })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.message ?? `HTTP ${response.status}`);
  }
}

async function shutdownIfStillIdle(accessSessionId) {
  shutdownTimer = null;
  if (config.offlineMode) return;

  try {
    const currentSession = await loadServerSession();
    const remainingSeconds = getRemainingSeconds(currentSession);

    if (
      currentSession &&
      (currentSession.accessSessionId !== accessSessionId || (remainingSeconds ?? 0) > 0)
    ) {
      clearEndNotice();
      await tick();
      return;
    }
  } catch (error) {
    log("Auto shutdown cancelled because the server could not be checked", { error: error.message });
    return;
  }

  log("No new session after end notice; shutting down PC", { accessSessionId });
  execFile("shutdown.exe", ["/s", "/f", "/t", "0"], { windowsHide: true }, (error) => {
    if (error) {
      log("PC shutdown command failed", { error: error.message });
    }
  });
}

function scheduleAutoShutdown(accessSessionId) {
  const delayMs = Math.max(0, config.autoShutdownAfterEndMinutes * 60_000);
  if (delayMs === 0) return;

  if (shutdownTimer) clearTimeout(shutdownTimer);
  shutdownTimer = setTimeout(() => {
    void shutdownIfStillIdle(accessSessionId);
  }, delayMs);
}

function beginEndNotice(session) {
  if (endNotice?.accessSessionId === session.accessSessionId) return;

  clearEndNotice();
  endNotice = {
    accessSessionId: session.accessSessionId,
    endsAt: session.endsAt,
    completionState: "ending",
    autoShutdownAt: null
  };

  void completeExpiredSession(session.accessSessionId)
    .then(() => {
      if (!endNotice || endNotice.accessSessionId !== session.accessSessionId) return;

      endNotice.completionState = "completed";
      if (config.autoShutdownAfterEndMinutes > 0) {
        endNotice.autoShutdownAt = new Date(Date.now() + config.autoShutdownAfterEndMinutes * 60_000).toISOString();
        scheduleAutoShutdown(session.accessSessionId);
      }
    })
    .catch((error) => {
      if (!endNotice || endNotice.accessSessionId !== session.accessSessionId) return;
      endNotice.completionState = "failed";
      log("Expired session completion failed", { error: error.message, accessSessionId: session.accessSessionId });
    });
}

function runTasklist() {
  return new Promise((resolve) => {
    execFile("tasklist.exe", ["/FO", "CSV", "/NH"], { windowsHide: true, timeout: 2_000 }, (error, stdout) => {
      if (error) {
        resolve({ ok: false, stdout: "", reason: error.killed ? "timeout" : "process_query_failed" });
        return;
      }

      resolve({ ok: true, stdout: stdout || "", reason: null });
    });
  });
}

function createGameTelemetry({
  gameRunning,
  gameState,
  currentHole = null,
  roundStatus,
  stateSource,
  confidence,
  reasonCode,
  detectorVersion = `process-v2-agent-${VERSION}`,
  observedAt = nowIso(),
  ...details
}) {
  gameSampleSequence += 1;
  return {
    schemaVersion: 2,
    sampleSequence: gameSampleSequence,
    monitorInstanceId: gameMonitorInstanceId,
    gameRunning,
    gameState,
    currentHole,
    roundStatus,
    stateSource,
    confidence,
    observedAt,
    reasonCode,
    detectorVersion,
    gameMode: details.gameMode ?? (gameRunning === false ? "none" : "unknown"),
    courseId: details.courseId ?? null,
    roundId: details.roundId ?? null,
    gameInstanceId: details.gameInstanceId ?? null,
    contextEpoch: Number.isSafeInteger(details.contextEpoch) ? details.contextEpoch : 0,
    holeStatus: details.holeStatus ?? "unknown",
    holeSource: details.holeSource ?? null,
    holeObservedAt: details.holeObservedAt ?? null,
    lastKnownHole: details.lastKnownHole ?? null,
    lastKnownHoleAt: details.lastKnownHoleAt ?? null,
    layoutVersion: config?.gameHoleLayoutVersion ?? "unconfigured"
  };
}

async function collectGameTelemetry() {
  if (!config.gameMonitoringEnabled) {
    return createGameTelemetry({
      gameRunning: null,
      gameState: "unknown",
      roundStatus: "unknown",
      stateSource: "none",
      confidence: "unknown",
      reasonCode: "unsupported"
    });
  }

  const processNames = config.gameProcessNames.map((name) => String(name).trim()).filter(Boolean);
  if (processNames.length === 0) {
    return createGameTelemetry({
      gameRunning: null,
      gameState: "unknown",
      roundStatus: "unknown",
      stateSource: "none",
      confidence: "unknown",
      reasonCode: "unconfigured"
    });
  }

  const result = await runTasklist();
  if (!result.ok) {
    return createGameTelemetry({
      gameRunning: null,
      gameState: "unknown",
      roundStatus: "unknown",
      stateSource: "process",
      confidence: "unknown",
      reasonCode: result.reason
    });
  }

  const configuredNames = new Set(processNames.map((name) => name.toLowerCase()));
  const runningNames = result.stdout
    .split(/\r?\n/)
    .map((line) => /^"((?:[^"]|"")*)"/.exec(line)?.[1]?.replace(/""/g, '"').toLowerCase())
    .filter(Boolean);
  const gameRunning = runningNames.some((name) => configuredNames.has(name));

  let observedState = screenGolfMonitor ? await screenGolfMonitor.observe(gameRunning) : null;
  if (observedState && screenHoleDetector) {
    const observedEpoch = observedState.contextEpoch;
    const observedGameInstanceId = observedState.gameInstanceId;
    const holeObservation = await screenHoleDetector.observe(observedState);
    const currentContext = screenGolfMonitor.getState();
    if (currentContext?.contextEpoch === observedEpoch && currentContext?.gameInstanceId === observedGameInstanceId) {
      observedState = screenGolfMonitor.applyHoleObservation(holeObservation) ?? observedState;
    }
  }
  if (observedState) {
    return createGameTelemetry({
      gameRunning,
      ...observedState,
      detectorVersion: `screen-golf-v2-agent-${VERSION}`
    });
  }

  return createGameTelemetry({
    gameRunning,
    gameState: gameRunning ? "unknown" : "not_running",
    roundStatus: gameRunning ? "unknown" : "not_started",
    stateSource: "process",
    confidence: "high",
    reasonCode: gameRunning ? "process_only" : null
  });
}

function refreshGameTelemetry() {
  if (gameTelemetryRefreshPromise) return gameTelemetryRefreshPromise;
  gameTelemetryRefreshPromise = collectGameTelemetry()
    .then((telemetry) => {
      latestGameTelemetry = telemetry;
      return telemetry;
    })
    .catch((error) => {
      log("Game telemetry refresh failed", { error: error.message });
      latestGameTelemetry = createGameTelemetry({
        gameRunning: null,
        gameState: "unknown",
        roundStatus: "unknown",
        stateSource: "none",
        confidence: "unknown",
        reasonCode: "process_query_failed"
      });
      return latestGameTelemetry;
    })
    .finally(() => {
      gameTelemetryRefreshPromise = null;
    });
  return gameTelemetryRefreshPromise;
}

function determineMode(session, remainingSeconds) {
  if (!session) return "hidden";
  if ((remainingSeconds ?? 0) <= 0) return "lock";

  const warningSeconds = config.warningBeforeMinutes * 60;

  if ((remainingSeconds ?? 0) <= warningSeconds && dismissedWarningSessionId !== session.accessSessionId) {
    return "warning";
  }

  return "hidden";
}

function getWindowBounds(mode) {
  const { workArea } = screen.getPrimaryDisplay();

  if (mode === "lock") {
    return {
      x: workArea.x,
      y: workArea.y,
      width: workArea.width,
      height: workArea.height
    };
  }

  if (mode === "warning") {
    return {
      x: workArea.x + workArea.width - 684,
      y: workArea.y + 24,
      width: 660,
      height: 480
    };
  }

  return {
    x: workArea.x + Math.round((workArea.width - 300) / 2),
    y: workArea.y + 24,
    width: 300,
    height: 86
  };
}

function createWindow(mode) {
  const bounds = getWindowBounds(mode);
  const isMini = mode === "mini";
  const isLock = mode === "lock";

  const window = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: !isLock,
    resizable: false,
    movable: !isLock,
    minimizable: false,
    maximizable: false,
    fullscreenable: isLock,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: mode === "warning" || isLock,
    webPreferences: {
      preload: path.join(ROOT, "electron-preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.setAlwaysOnTop(true, "screen-saver");
  window.loadFile(path.join(ROOT, "renderer", "index.html"));

  if (isMini) {
    window.setIgnoreMouseEvents(true, { forward: true });
  }

  window.on("close", (event) => {
    if (currentMode === "lock" && !config.allowCloseWithEsc) {
      event.preventDefault();
    }
  });

  return window;
}

function ensureWindow(mode) {
  if (mode === "hidden") {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.destroy();
    }
    mainWindow = null;
    currentMode = mode;
    return;
  }

  if (mainWindow && currentMode === mode && !mainWindow.isDestroyed()) {
    return;
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy();
  }

  currentMode = mode;
  mainWindow = createWindow(mode);
}

async function postHeartbeat(payload) {
  if (config.offlineMode) return { ok: false, skipped: true };
  if (!hasAgentCredentials()) {
    return { ok: false, skipped: true };
  }

  const baseUrl = String(config.apiBaseUrl).replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/api/agent/heartbeat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.agentToken}`,
      "x-vista-agent-id": config.agentId,
      "x-vista-agent-version": VERSION
    },
    body: JSON.stringify(payload)
  });

  const responseBody = await response.json().catch(() => null);
  return {
    ok: response.ok,
    status: response.status,
    gameTelemetryAccepted:
      responseBody && typeof responseBody.gameTelemetryAccepted === "boolean"
        ? responseBody.gameTelemetryAccepted
        : null,
    acceptedGameTelemetrySchemaVersions: Array.isArray(responseBody?.acceptedGameTelemetrySchemaVersions)
      ? responseBody.acceptedGameTelemetrySchemaVersions
      : [],
    roundEventAckIds: Array.isArray(responseBody?.roundEventAckIds) ? responseBody.roundEventAckIds : [],
    roundEventRejected: Array.isArray(responseBody?.roundEventRejected) ? responseBody.roundEventRejected : []
  };
}

function recordHeartbeatResult(result) {
  if (result.skipped) return;
  const issueKey = !result.ok
    ? `http_${result.status ?? "unknown"}`
    : result.gameTelemetryAccepted === false
      ? "telemetry_rejected"
      : null;
  const now = Date.now();

  if (issueKey) {
    if (issueKey !== lastHeartbeatIssueKey || now - lastHeartbeatIssueLoggedAt >= 300_000) {
      log("Heartbeat warning", { reason: issueKey });
      lastHeartbeatIssueLoggedAt = now;
    }
    lastHeartbeatIssueKey = issueKey;
    return;
  }

  if (lastHeartbeatIssueKey) log("Heartbeat recovered");
  lastHeartbeatIssueKey = null;
}

async function tick() {
  let session = await loadSession();
  let remainingSeconds = getRemainingSeconds(session);
  // OCR runs on its own loop. Session warnings and shutdown must never wait for it.
  if (!latestGameTelemetry) void refreshGameTelemetry();
  const gameTelemetry =
    latestGameTelemetry ??
    createGameTelemetry({
      gameRunning: null,
      gameState: "unknown",
      roundStatus: "unknown",
      stateSource: "none",
      confidence: "unknown",
      reasonCode: config.gameMonitoringEnabled ? "unconfigured" : "unsupported"
    });
  const gameAppRunning = gameTelemetry.gameRunning;
  let mode = "hidden";

  if (session && (remainingSeconds ?? 0) <= 0) {
    beginEndNotice(session);
    mode = "lock";
  } else if (endNotice) {
    const hasNewSession = session && session.accessSessionId !== endNotice.accessSessionId;
    if (hasNewSession || (session && (remainingSeconds ?? 0) > 0)) {
      clearEndNotice();
      mode = determineMode(session, remainingSeconds);
    } else {
      mode = "lock";
    }
  } else {
    mode = determineMode(session, remainingSeconds);
  }

  if (!session && endNotice) {
    session = {
      accessSessionId: endNotice.accessSessionId,
      customerLabel: null,
      startsAt: null,
      endsAt: endNotice.endsAt,
      status: "completed"
    };
    remainingSeconds = 0;
  }

  if (session?.accessSessionId && activeSessionId !== session.accessSessionId) {
    activeSessionId = session.accessSessionId;
    dismissedWarningSessionId = null;
    extensionRequestState = null;
  }

  ensureWindow(mode);

  const state = {
    mode,
    now: nowIso(),
    agent: {
      agentId: config.agentId,
      bayCode: config.bayCode,
      pcName: config.pcName,
      version: VERSION,
      gameAppRunning
    },
    session: session
      ? {
          accessSessionId: session.accessSessionId,
          customerLabel: session.customerLabel ?? "?댁슜 怨좉컼",
          startsAt: session.startsAt ?? null,
          endsAt: session.endsAt,
          status: session.status,
          remainingSeconds
        }
      : null,
    policy: {
      warningBeforeMinutes: config.warningBeforeMinutes,
      criticalBeforeMinutes: config.criticalBeforeMinutes,
      extensionMinutes: config.extensionMinutes,
      extensionPrice: config.extensionPrice
    },
    extensionRequest: extensionRequestState,
    endNotice: endNotice
      ? {
          completionState: endNotice.completionState,
          autoShutdownAt: endNotice.autoShutdownAt
        }
      : null
  };

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("agent-state", state);
  }

  try {
    const heartbeatResult = await postHeartbeat({
      agentId: config.agentId,
      storeId: config.storeId,
      bayId: config.bayId,
      bayCode: config.bayCode,
      pcName: config.pcName,
      agentVersion: VERSION,
      status: session ? (remainingSeconds === 0 ? "expired" : "playing") : "idle",
      accessSessionId: session?.accessSessionId ?? null,
      remainingSeconds,
      gameAppRunning,
      ...(config.gameMonitoringEnabled ? { gameTelemetry } : {}),
      ...(roundEventOutbox ? { roundEvents: roundEventOutbox.list(20) } : {}),
      screenLocked: mode === "lock",
      lastSeenAt: nowIso()
    });
    if (heartbeatResult.ok && roundEventOutbox) {
      roundEventOutbox.applyServerResult(heartbeatResult.roundEventAckIds, heartbeatResult.roundEventRejected);
    }
    recordHeartbeatResult(heartbeatResult);
  } catch (error) {
    log("Heartbeat failed", { error: error.message });
  }
}

async function requestExtension(requestedMinutes) {
  const session = await loadSession();
  const safeRequestedMinutes = Math.max(30, Math.round(Number(requestedMinutes || config.extensionMinutes) / 30) * 30);
  const priceAmount = Math.max(0, Math.round((safeRequestedMinutes / config.extensionMinutes) * config.extensionPrice));

  if (!session) {
    extensionRequestState = { status: "failed", message: "吏꾪뻾 以묒씤 ?댁슜 ?몄뀡???놁뒿?덈떎." };
    return extensionRequestState;
  }

  extensionRequestState = { status: "pending", message: "?곗옣 ?붿껌??蹂대궡??以묒엯?덈떎." };

  if (!hasAgentCredentials()) {
    extensionRequestState = {
      status: "local_demo",
      message: `${safeRequestedMinutes}遺??곗옣 ?붿껌??湲곕줉?섏뿀?듬땲?? ?쒕쾭 API ?곌껐 ???뚯뒪??紐⑤뱶?낅땲??`
    };
    return extensionRequestState;
  }

  try {
    const baseUrl = String(config.apiBaseUrl).replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/api/agent/extension-request`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.agentToken}`,
        "x-vista-agent-id": config.agentId
      },
      body: JSON.stringify({
        accessSessionId: session.accessSessionId,
        requestedMinutes: safeRequestedMinutes,
        priceAmount
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      throw new Error(data.message ?? `HTTP ${response.status}`);
    }

    extensionRequestState = {
      status: data.status ?? "requested",
      message: data.message ?? "?곗옣 ?붿껌???묒닔?섏뿀?듬땲??"
    };
  } catch (error) {
    extensionRequestState = {
      status: "failed",
      message: `?곗옣 ?붿껌 ?ㅽ뙣: ${error.message}`
    };
  }

  return extensionRequestState;
}

ipcMain.handle("confirm-warning", async () => {
  const session = await loadSession();

  if (session?.accessSessionId) {
    dismissedWarningSessionId = session.accessSessionId;
  }

  await tick();
  return { ok: true };
});

ipcMain.handle("request-extension", async (_event, requestedMinutes) => {
  const result = await requestExtension(requestedMinutes);
  await tick();
  return result;
});

ipcMain.handle("close-agent", () => {
  if (config?.allowCloseWithEsc) {
    app.quit();
  }
});

// --- First-run bay picker -------------------------------------------------

function createSetupWindow() {
  const window = new BrowserWindow({
    width: 720,
    height: 560,
    frame: true,
    resizable: false,
    title: "VISTA Bay Agent ?ㅼ젙",
    webPreferences: {
      preload: path.join(ROOT, "electron-preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.loadFile(path.join(ROOT, "renderer", "setup.html"));
  return window;
}

ipcMain.handle("get-bays", () => {
  return baysConfig.bays.map((bay) => ({
    bayCode: bay.bayCode,
    label: bay.label ?? bay.bayCode
  }));
});

ipcMain.handle("select-bay", (_event, bayCode) => {
  const exists = baysConfig.bays.some((bay) => bay.bayCode === bayCode);
  if (!exists) return { ok: false, message: "?????녿뒗 ??앹엯?덈떎." };

  saveSelectedBay(bayCode);
  config = loadConfig();
  log("Bay selected", { bayCode });

  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.destroy();
    setupWindow = null;
  }

  void startAgentLoop();
  return { ok: true };
});

async function startAgentLoop() {
  roundEventOutbox = createRoundEventOutbox({ filePath: ROUND_OUTBOX_PATH, bayCode: config.bayCode });
  screenGolfMonitor = createScreenGolfMonitor({
    logFile: config.gameStateLogFile,
    locator: createGameLogLocator({
      logFile: config.gameStateLogFile,
      patterns: config.gameStateLogPatterns
    }),
    onDiagnostic: writeGameDiagnostic,
    onRoundEnded: (event) => {
      try {
        roundEventOutbox.enqueue({ ...event, agentVersion: VERSION });
        log("Regular game returned to lobby", { eventId: event.eventId, roundId: event.roundId });
      } catch (error) {
        log("Round event could not be persisted", { error: error.message });
      }
    }
  });
  screenHoleDetector = config.gameHoleDetectionEnabled
    ? createScreenHoleDetector({
        desktopCapturer,
        userDataPath: USER_DATA,
        helperSourcePath: path.join(ROOT, "hole-ocr.ps1"),
        exactSourceName: config.gameCaptureSourceName,
        roi: config.gameHoleRoi,
        allowDigitsOnly: config.gameHoleAllowDigitsOnlyInRoi,
        confirmationCount: config.gameHoleConfirmationCount,
        sampleWindow: config.gameHoleSampleWindow,
        sampleWindowMs: config.gameHoleSampleWindowSeconds * 1000,
        staleAfterMs: config.gameHoleStaleSeconds * 1000,
        layoutVersion: config.gameHoleLayoutVersion,
        onDiagnostic: writeGameDiagnostic
      })
    : null;
  await startGameLogDiagnostics();
  await tick();
  void refreshGameTelemetry();
  if (gameTelemetryTimer) clearInterval(gameTelemetryTimer);
  gameTelemetryTimer = setInterval(() => {
    void refreshGameTelemetry();
  }, config.gameTelemetryIntervalSeconds * 1000);
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    void tick();
  }, Math.max(1, config.pollIntervalSeconds) * 1000);
}

app.whenReady().then(async () => {
  USER_DATA = app.getPath("userData");
  USER_CONFIG_PATH = path.join(USER_DATA, "agent.config.json");
  LOG_DIR = path.join(USER_DATA, "logs");
  ROUND_OUTBOX_PATH = path.join(USER_DATA, "round-event-outbox-v1.json");

  baysConfig = loadBaysConfig();
  config = loadConfig();

  if (!config) {
    log("No bay selected yet, opening setup window");
    setupWindow = createSetupWindow();
    return;
  }

  log("VISTA Electron Agent started", {
    agentId: config.agentId,
    bayCode: config.bayCode,
    pcName: config.pcName,
    sessionSource: config.sessionSource
  });

  await startAgentLoop();
});

app.on("window-all-closed", () => {
  // Keep the agent process alive. The window is recreated whenever the mode changes.
  // Exception: if we are still in setup (no bay chosen) and the user closes it, quit.
  if (!config) {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (pollTimer) clearInterval(pollTimer);
  if (gameLogProbeTimer) clearInterval(gameLogProbeTimer);
  if (gameTelemetryTimer) clearInterval(gameTelemetryTimer);
});
