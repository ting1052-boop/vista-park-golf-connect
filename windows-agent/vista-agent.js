#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFile, spawn } = require("node:child_process");

const ROOT = __dirname;
const CONFIG_PATH = path.join(ROOT, "agent.config.json");
const DEFAULT_CONFIG_PATH = path.join(ROOT, "agent.config.example.json");
const LOG_DIR = path.join(ROOT, "logs");
const VERSION = "0.1.0";

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
  fs.appendFileSync(path.join(LOG_DIR, "vista-agent.log"), `${line}\n`, "utf8");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadConfig() {
  const source = fs.existsSync(CONFIG_PATH) ? CONFIG_PATH : DEFAULT_CONFIG_PATH;
  const config = readJson(source);

  return {
    ...config,
    pcName: config.pcName || os.hostname(),
    heartbeatIntervalSeconds: Number(config.heartbeatIntervalSeconds || 15),
    warningBeforeMinutes: Number(config.warningBeforeMinutes || 10),
    gameProcessNames: Array.isArray(config.gameProcessNames) ? config.gameProcessNames : [],
    sessionFile: config.sessionFile || "agent-session.json"
  };
}

function loadSession(config) {
  const sessionPath = path.join(ROOT, config.sessionFile);

  if (!fs.existsSync(sessionPath)) {
    return null;
  }

  try {
    const session = readJson(sessionPath);
    if (session.status !== "active") return null;
    if (!session.endsAt) return null;

    return session;
  } catch (error) {
    log("Failed to read session file", { error: error.message });
    return null;
  }
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

function openBrowserPage(fileName, params) {
  const filePath = path.join(ROOT, "screens", fileName);
  const query = new URLSearchParams(params).toString();
  const target = `file:///${filePath.replace(/\\/g, "/")}${query ? `?${query}` : ""}`;
  const edgePath32 = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  const edgePath64 = "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe";
  const browser = fs.existsSync(edgePath64) ? edgePath64 : edgePath32;

  if (fs.existsSync(browser)) {
    spawn(browser, ["--new-window", "--kiosk", target, "--edge-kiosk-type=fullscreen"], {
      detached: true,
      stdio: "ignore",
      windowsHide: false
    }).unref();
    return;
  }

  spawn("cmd.exe", ["/c", "start", "", target], {
    detached: true,
    stdio: "ignore",
    windowsHide: false
  }).unref();
}

async function postHeartbeat(config, payload) {
  if (!config.apiBaseUrl || !config.agentSecret || config.agentSecret === "change-me") {
    return { ok: false, skipped: true, reason: "API settings are not ready" };
  }

  const url = `${String(config.apiBaseUrl).replace(/\/$/, "")}/api/agent/heartbeat`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-vista-agent-secret": config.agentSecret
    },
    body: JSON.stringify(payload)
  });

  const body = await response.text();
  return { ok: response.ok, status: response.status, body: body.slice(0, 500) };
}

function buildHeartbeat(config, session, gameAppRunning) {
  const remainingSeconds = getRemainingSeconds(session);

  return {
    agentId: config.agentId,
    storeId: config.storeId,
    bayId: config.bayId,
    bayCode: config.bayCode,
    pcName: config.pcName,
    agentVersion: VERSION,
    status: session ? (remainingSeconds === 0 ? "expired" : "playing") : "idle",
    accessSessionId: session?.accessSessionId ?? null,
    customerLabel: session?.customerLabel ?? null,
    startsAt: session?.startsAt ?? null,
    endsAt: session?.endsAt ?? null,
    remainingSeconds,
    gameAppRunning,
    screenLocked: session ? remainingSeconds === 0 : false,
    lastSeenAt: nowIso()
  };
}

async function mainLoop() {
  const config = loadConfig();
  const state = {
    warnedSessionId: null,
    lockedSessionId: null
  };

  log("VISTA Windows Agent started", {
    agentId: config.agentId,
    bayCode: config.bayCode,
    pcName: config.pcName,
    interval: config.heartbeatIntervalSeconds
  });

  async function tick() {
    const session = loadSession(config);
    const gameAppRunning = await isAnyGameRunning(config.gameProcessNames);
    const heartbeat = buildHeartbeat(config, session, gameAppRunning);

    if (session) {
      const warningSeconds = config.warningBeforeMinutes * 60;
      const remaining = heartbeat.remainingSeconds ?? 0;

      if (remaining > 0 && remaining <= warningSeconds && state.warnedSessionId !== session.accessSessionId) {
        state.warnedSessionId = session.accessSessionId;
        log("Showing time warning screen", { accessSessionId: session.accessSessionId, remaining });

        if (config.openWarningScreen) {
          openBrowserPage("warning.html", {
            bay: config.bayCode,
            remaining: String(Math.ceil(remaining / 60)),
            endsAt: session.endsAt
          });
        }
      }

      if (remaining === 0 && state.lockedSessionId !== session.accessSessionId) {
        state.lockedSessionId = session.accessSessionId;
        log("Showing session lock screen", { accessSessionId: session.accessSessionId });

        if (config.openLockScreen) {
          openBrowserPage("lock.html", {
            bay: config.bayCode,
            endsAt: session.endsAt
          });
        }
      }
    }

    try {
      const result = await postHeartbeat(config, heartbeat);
      log("heartbeat", { status: heartbeat.status, remainingSeconds: heartbeat.remainingSeconds, result });
    } catch (error) {
      log("Failed to send heartbeat", { error: error.message });
    }
  }

  await tick();
  setInterval(() => {
    void tick();
  }, config.heartbeatIntervalSeconds * 1000);
}

mainLoop().catch((error) => {
  log("Agent fatal error", { error: error.message });
  process.exitCode = 1;
});
