/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const { createUsageWindowMonitor } = require("./usage-window-monitor");
const { execFile } = require("node:child_process");

function resolveGolfUsageConfig(config) {
  const bayCode = String(config.bayCode || "");
  const songdoPark = /(?:^|:)SD-P-0[12]$/i.test(bayCode) || /(?:^|:)P-0[12]$/i.test(bayCode) && /VISTA-XII/i.test(bayCode);
  const songdoGolf = /(?:^|:)SD-R-0[1-7]$/i.test(bayCode) ||
    /(?:^|:)A-0[1-7]$/i.test(bayCode) && /VISTA-XII/i.test(bayCode);
  if (songdoPark) {
    return {
      enabled: config.usageMonitoringEnabled !== false && config.gameMonitoringEnabled !== false,
      profile: "park_log",
      processNames: Array.isArray(config.gameProcessNames) && config.gameProcessNames.length
        ? config.gameProcessNames : ["ScreenGolf.exe"],
      durationMs: 60 * 60_000
    };
  }
  return {
    enabled: config.golfUsageMonitoringEnabled === true ||
      (config.golfUsageMonitoringEnabled !== false && songdoGolf),
    profile: "golf_input",
    processNames: Array.isArray(config.golfUsageProcessNames) && config.golfUsageProcessNames.length
      ? config.golfUsageProcessNames : ["UD7.exe", "ParOnGolfV5.exe"],
    durationMs: 60 * 60_000
  };
}

function createGolfUsageMonitor({ processNames, durationMs = 60 * 60_000, readSnapshot, now = Date.now, usageWindow = null }) {
  const names = new Set(processNames.map((name) => name.toLowerCase().replace(/\.exe$/, "")));
  const windowMonitor = usageWindow || createUsageWindowMonitor({
    bayCode: "memory",
    durationMs,
    now,
    agentVersion: "test"
  });
  let previousInput = null;
  return {
    async observe(gameRunning) {
      const time = now();
      if (gameRunning !== true) {
        previousInput = null;
        return windowMonitor.observe({ gameRunning, trigger: false, healthy: gameRunning === false, observedMs: time });
      }
      let snapshot;
      try { snapshot = await readSnapshot(); } catch { snapshot = null; }
      if (!snapshot || !Number.isSafeInteger(snapshot.inputTick) || snapshot.inputTick < 0 ||
          typeof snapshot.foregroundProcess !== "string") {
        // Re-baseline after a gap; never attribute an old input to the current window.
        previousInput = null;
        return windowMonitor.observe({ gameRunning, trigger: false, healthy: false, observedMs: time });
      }
      const fresh = previousInput !== null && previousInput !== snapshot.inputTick;
      previousInput = snapshot.inputTick;
      const targetInput = fresh && names.has(snapshot.foregroundProcess.toLowerCase().replace(/\.exe$/, ""));
      return windowMonitor.observe({
        gameRunning,
        trigger: targetInput,
        healthy: true,
        source: "foreground_input",
        confidence: "medium",
        lastInputAt: targetInput ? time : null,
        observedMs: time
      });
    }
  };
}

function createWindowsInputReader({ helperSourcePath, userDataPath }) {
  // PowerShell cannot execute a script inside app.asar.
  const helperPath = path.join(userDataPath, "golf-input-snapshot.ps1");
  fs.copyFileSync(helperSourcePath, helperPath);
  return () => new Promise((resolve) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", helperPath],
      { windowsHide: true, timeout: 4000, maxBuffer: 16 * 1024 }, (error, stdout) => {
        if (error) return resolve(null);
        try { resolve(JSON.parse(stdout.trim())); } catch { resolve(null); }
      });
  });
}

module.exports = { resolveGolfUsageConfig, createGolfUsageMonitor, createWindowsInputReader };
