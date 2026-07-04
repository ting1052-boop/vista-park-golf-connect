/* eslint-disable @typescript-eslint/no-require-imports */

const { app, BrowserWindow, ipcMain, screen } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFile } = require("node:child_process");

const ROOT = __dirname; // bundled, read-only when packaged (asar)
const BAYS_CONFIG_PATH = path.join(ROOT, "bays.config.json");
const LOCAL_BAYS_CONFIG_PATH = path.join(ROOT, "bays.config.local.json");
const VERSION = "0.3.0";

// Writable locations. In a packaged exe, ROOT is inside a read-only archive,
// so the selected bay, the local test session, and logs all live in userData.
let USER_DATA = ROOT;
let USER_CONFIG_PATH = path.join(ROOT, "agent.config.json");
let LOG_DIR = path.join(ROOT, "logs");

let mainWindow = null;
let setupWindow = null;
let currentMode = null;
let config = null;
let baysConfig = null;
let activeSessionId = null;
let dismissedWarningSessionId = null;
let dismissedCriticalSessionId = null;
let extensionRequestState = null;
let pollTimer = null;

function nowIso() {
  return new Date().toISOString();
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadBaysConfig() {
  const configPath = fs.existsSync(LOCAL_BAYS_CONFIG_PATH) ? LOCAL_BAYS_CONFIG_PATH : BAYS_CONFIG_PATH;
  const raw = readJson(configPath);
  const shared = raw.shared ?? {};
  const bays = Array.isArray(raw.bays) ? raw.bays : [];
  return { shared, bays };
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

  const merged = { ...baysConfig.shared, ...bay };

  return {
    ...merged,
    pcName: merged.pcName || os.hostname(),
    sessionSource: merged.sessionSource || "local",
    sessionFile: merged.sessionFile || "agent-session.json",
    pollIntervalSeconds: Number(merged.pollIntervalSeconds || 3),
    warningBeforeMinutes: Number(merged.warningBeforeMinutes || 10),
    criticalBeforeMinutes: Number(merged.criticalBeforeMinutes || 3),
    extensionMinutes: Number(merged.extensionMinutes || 30),
    extensionPrice: Number(merged.extensionPrice || 6000),
    gameProcessNames: Array.isArray(merged.gameProcessNames) ? merged.gameProcessNames : [],
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
  if (!config.apiBaseUrl || !config.agentToken || config.agentToken.startsWith("change-me")) {
    return null;
  }

  const baseUrl = String(config.apiBaseUrl).replace(/\/$/, "");
  const url = `${baseUrl}/api/agent/session?agentId=${encodeURIComponent(config.agentId)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.agentToken}`,
      "x-vista-agent-id": config.agentId
    }
  });

  if (!response.ok) {
    throw new Error(`session ${response.status}`);
  }

  const data = await response.json();
  return data.session ?? null;
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

function runTasklist() {
  return new Promise((resolve) => {
    execFile("tasklist.exe", ["/FO", "CSV", "/NH"], { windowsHide: true }, (error, stdout) => {
      if (error) {
        resolve("");
        return;
      }

      resolve(stdout || "");
    });
  });
}

async function isAnyGameRunning(processNames) {
  if (processNames.length === 0) return false;

  const tasklist = (await runTasklist()).toLowerCase();
  return processNames.some((name) => tasklist.includes(`"${name.toLowerCase()}"`));
}

function determineMode(session, remainingSeconds) {
  if (!session) return "mini";
  if ((remainingSeconds ?? 0) <= 0) return "lock";

  const warningSeconds = config.warningBeforeMinutes * 60;
  const criticalSeconds = config.criticalBeforeMinutes * 60;

  if ((remainingSeconds ?? 0) <= criticalSeconds && dismissedCriticalSessionId !== session.accessSessionId) {
    return "warning";
  }

  if ((remainingSeconds ?? 0) <= warningSeconds && dismissedWarningSessionId !== session.accessSessionId) {
    return "warning";
  }

  return "mini";
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
      x: workArea.x + Math.round((workArea.width - 700) / 2),
      y: workArea.y + Math.round((workArea.height - 420) / 2),
      width: 700,
      height: 420
    };
  }

  return {
    x: workArea.x + Math.round((workArea.width - 600) / 2),
    y: workArea.y + 24,
    width: 600,
    height: 172
  };
}

function createWindow(mode) {
  const bounds = getWindowBounds(mode);
  const isMini = mode === "mini";
  const isLock = mode === "lock";

  const window = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: isMini,
    resizable: false,
    movable: !isLock,
    minimizable: false,
    maximizable: false,
    fullscreenable: isLock,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: !isMini,
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
  if (!config.apiBaseUrl || !config.agentToken || config.agentToken.startsWith("change-me")) {
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

  return { ok: response.ok, status: response.status };
}

async function tick() {
  const session = await loadSession();
  const remainingSeconds = getRemainingSeconds(session);
  const gameAppRunning = await isAnyGameRunning(config.gameProcessNames);
  const mode = determineMode(session, remainingSeconds);

  if (session?.accessSessionId && activeSessionId !== session.accessSessionId) {
    activeSessionId = session.accessSessionId;
    dismissedWarningSessionId = null;
    dismissedCriticalSessionId = null;
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
          customerLabel: session.customerLabel ?? "이용 고객",
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
    extensionRequest: extensionRequestState
  };

  mainWindow.webContents.send("agent-state", state);

  try {
    await postHeartbeat({
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
      screenLocked: mode === "lock",
      lastSeenAt: nowIso()
    });
  } catch (error) {
    log("Heartbeat failed", { error: error.message });
  }
}

async function requestExtension() {
  const session = await loadSession();

  if (!session) {
    extensionRequestState = { status: "failed", message: "진행 중인 이용 세션이 없습니다." };
    return extensionRequestState;
  }

  extensionRequestState = { status: "pending", message: "연장 요청을 보내는 중입니다." };

  if (!config.apiBaseUrl || !config.agentToken || config.agentToken.startsWith("change-me")) {
    extensionRequestState = {
      status: "local_demo",
      message: `${config.extensionMinutes}분 연장 요청이 기록되었습니다. 서버 API 연결 전 테스트 모드입니다.`
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
        requestedMinutes: config.extensionMinutes,
        priceAmount: config.extensionPrice
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      throw new Error(data.message ?? `HTTP ${response.status}`);
    }

    extensionRequestState = {
      status: data.status ?? "requested",
      message: data.message ?? "연장 요청이 접수되었습니다."
    };
  } catch (error) {
    extensionRequestState = {
      status: "failed",
      message: `연장 요청 실패: ${error.message}`
    };
  }

  return extensionRequestState;
}

ipcMain.handle("confirm-warning", async () => {
  const session = await loadSession();
  const remainingSeconds = getRemainingSeconds(session);

  if (session?.accessSessionId) {
    const criticalSeconds = config.criticalBeforeMinutes * 60;
    if ((remainingSeconds ?? 0) <= criticalSeconds) {
      dismissedCriticalSessionId = session.accessSessionId;
    } else {
      dismissedWarningSessionId = session.accessSessionId;
    }
  }

  await tick();
  return { ok: true };
});

ipcMain.handle("request-extension", async () => {
  const result = await requestExtension();
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
    title: "VISTA Bay Agent 설정",
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
  if (!exists) return { ok: false, message: "알 수 없는 타석입니다." };

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
  await tick();
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    void tick();
  }, Math.max(1, config.pollIntervalSeconds) * 1000);
}

app.whenReady().then(async () => {
  USER_DATA = app.getPath("userData");
  USER_CONFIG_PATH = path.join(USER_DATA, "agent.config.json");
  LOG_DIR = path.join(USER_DATA, "logs");

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
});
