/* eslint-disable @typescript-eslint/no-require-imports */

const { app, BrowserWindow, ipcMain, screen } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFile } = require("node:child_process");

const ROOT = __dirname;
const CONFIG_PATH = path.join(ROOT, "agent.config.json");
const DEFAULT_CONFIG_PATH = path.join(ROOT, "agent.config.example.json");
const LOG_DIR = path.join(ROOT, "logs");
const VERSION = "0.2.0";

let mainWindow = null;
let currentMode = null;
let config = null;
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
  fs.appendFileSync(path.join(LOG_DIR, "vista-agent-overlay.log"), `${line}\n`, "utf8");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadConfig() {
  const source = fs.existsSync(CONFIG_PATH) ? CONFIG_PATH : DEFAULT_CONFIG_PATH;
  const raw = readJson(source);

  return {
    ...raw,
    pcName: raw.pcName || os.hostname(),
    sessionSource: raw.sessionSource || "local",
    sessionFile: raw.sessionFile || "agent-session.json",
    pollIntervalSeconds: Number(raw.pollIntervalSeconds || 3),
    warningBeforeMinutes: Number(raw.warningBeforeMinutes || 10),
    criticalBeforeMinutes: Number(raw.criticalBeforeMinutes || 3),
    extensionMinutes: Number(raw.extensionMinutes || 30),
    extensionPrice: Number(raw.extensionPrice || 6000),
    gameProcessNames: Array.isArray(raw.gameProcessNames) ? raw.gameProcessNames : [],
    allowCloseWithEsc: raw.allowCloseWithEsc !== false
  };
}

function loadLocalSession() {
  const sessionPath = path.join(ROOT, config.sessionFile);

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
    x: workArea.x + workArea.width - 330,
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
  if (!config.apiBaseUrl || !config.agentSecret || config.agentSecret === "change-me") {
    return { ok: false, skipped: true };
  }

  const baseUrl = String(config.apiBaseUrl).replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/api/agent/heartbeat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-vista-agent-secret": config.agentSecret
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
  if (config.allowCloseWithEsc) {
    app.quit();
  }
});

app.whenReady().then(async () => {
  config = loadConfig();
  log("VISTA Electron Agent started", {
    agentId: config.agentId,
    bayCode: config.bayCode,
    pcName: config.pcName,
    sessionSource: config.sessionSource
  });

  await tick();
  pollTimer = setInterval(() => {
    void tick();
  }, Math.max(1, config.pollIntervalSeconds) * 1000);
});

app.on("window-all-closed", () => {
  // Keep the agent process alive. The window is recreated whenever the mode changes.
});

app.on("before-quit", () => {
  if (pollTimer) clearInterval(pollTimer);
});
