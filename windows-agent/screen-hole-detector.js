/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");

function extractHoleCandidates(text, options = {}) {
  const source = String(text ?? "").normalize("NFKC");
  const patterns = [/(?:CURRENT\s*)?(?:HOLE|홀)\s*[:#-]?\s*(\d{1,2})/giu, /\b(\d{1,2})\s*(?:HOLE|H)\b/giu, /(\d{1,2})\s*홀/gu];
  const values = [];
  for (const pattern of patterns) for (const match of source.matchAll(pattern)) values.push(Number(match[1]));
  if (values.length === 0 && options.allowDigitsOnly === true) {
    const onlyNumber = /^\s*[^0-9]{0,3}(\d{1,2})[^0-9]{0,3}\s*$/u.exec(source);
    if (onlyNumber) values.push(Number(onlyNumber[1]));
  }
  return [...new Set(values.filter((value) => Number.isInteger(value) && value >= 1 && value <= 18))];
}

function createHoleResolver(options = {}) {
  const confirmationCount = Math.max(2, Number(options.confirmationCount ?? 2));
  const sampleWindow = Math.max(confirmationCount, Number(options.sampleWindow ?? 3));
  const sampleWindowMs = Math.max(2_000, Number(options.sampleWindowMs ?? 6_000));
  const staleAfterMs = Math.max(1_000, Number(options.staleAfterMs ?? 5_000));
  let activeEpoch = null;
  let samples = [];
  let confirmedHole = null;
  let confirmedAt = null;
  let lastKnownHole = null;
  let lastKnownHoleAt = null;
  let pendingHole = null;
  let lastReasonCode = "recognition_pending";

  function reset(contextEpoch) {
    activeEpoch = contextEpoch ?? null;
    samples = [];
    confirmedHole = null;
    confirmedAt = null;
    lastKnownHole = null;
    lastKnownHoleAt = null;
    pendingHole = null;
    lastReasonCode = "recognition_pending";
  }

  function snapshot(nowMs = Date.now(), contextEpoch = activeEpoch, active = true) {
    if (!active) return { contextEpoch, currentHole: null, holeStatus: "not_applicable", holeSource: null, holeObservedAt: null, lastKnownHole: null, lastKnownHoleAt: null, reasonCode: null, observedAt: new Date(nowMs).toISOString() };
    if (activeEpoch !== contextEpoch) reset(contextEpoch);
    const stale = confirmedHole !== null && nowMs - Date.parse(confirmedAt) > staleAfterMs;
    return {
      contextEpoch,
      currentHole: stale || pendingHole !== null ? null : confirmedHole,
      holeStatus: pendingHole !== null ? "transitioning" : stale ? "stale" : confirmedHole !== null ? "confirmed" : "unknown",
      holeSource: confirmedHole !== null || pendingHole !== null ? "ocr" : null,
      holeObservedAt: stale ? null : confirmedAt,
      lastKnownHole,
      lastKnownHoleAt,
      reasonCode: stale ? "source_stale" : lastReasonCode,
      observedAt: new Date(nowMs).toISOString()
    };
  }

  function addSample({ contextEpoch, frameId, candidate, observedAt, reasonCode = null }) {
    if (activeEpoch !== contextEpoch) reset(contextEpoch);
    if (samples.some((sample) => sample.frameId === frameId)) return snapshot(Date.now(), contextEpoch, true);
    const observedMs = Number.isFinite(Date.parse(observedAt)) ? Date.parse(observedAt) : Date.now();
    samples.push({ frameId, candidate, observedAt: new Date(observedMs).toISOString(), observedMs });
    samples = samples.filter((sample) => observedMs - sample.observedMs <= sampleWindowMs).slice(-sampleWindow);
    lastReasonCode = reasonCode;
    if (Number.isInteger(candidate)) {
      const matching = samples.filter((sample) => sample.candidate === candidate);
      pendingHole = candidate === confirmedHole ? null : candidate;
      if (matching.length >= confirmationCount) {
        confirmedHole = candidate;
        confirmedAt = matching.at(-1).observedAt;
        lastKnownHole = candidate;
        lastKnownHoleAt = confirmedAt;
        pendingHole = null;
        lastReasonCode = null;
      }
    } else pendingHole = null;
    return snapshot(observedMs, contextEpoch, true);
  }
  return { addSample, reset, snapshot };
}

function normalizeRoi(roi) {
  if (!roi || typeof roi !== "object") return null;
  const values = [Number(roi.x), Number(roi.y), Number(roi.width), Number(roi.height)];
  if (!values.every(Number.isFinite)) return null;
  const [x, y, width, height] = values;
  return x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= 1 && y + height <= 1 ? { x, y, width, height } : null;
}

function execFileAsync(file, args, options) {
  return new Promise((resolve, reject) => execFile(file, args, options, (error, stdout) => error ? reject(error) : resolve(stdout)));
}

function createScreenHoleDetector(options = {}) {
  const desktopCapturer = options.desktopCapturer;
  const userDataPath = String(options.userDataPath ?? "");
  const exactSourceName = String(options.exactSourceName ?? "").trim();
  const roi = normalizeRoi(options.roi);
  const allowDigitsOnly = options.allowDigitsOnly === true && roi !== null;
  const layoutVersion = String(options.layoutVersion ?? "unconfigured");
  const helperSourcePath = String(options.helperSourcePath ?? "");
  const helperPath = path.join(userDataPath, "runtime", "hole-ocr.ps1");
  const onDiagnostic = typeof options.onDiagnostic === "function" ? options.onDiagnostic : () => {};
  const resolver = createHoleResolver(options);
  let frameSequence = 0;

  function ensureHelper() {
    if (!helperSourcePath || !fs.existsSync(helperSourcePath)) throw new Error("ocr_helper_missing");
    fs.mkdirSync(path.dirname(helperPath), { recursive: true });
    const source = fs.readFileSync(helperSourcePath);
    if (!fs.existsSync(helperPath) || !fs.readFileSync(helperPath).equals(source)) fs.writeFileSync(helperPath, source);
  }

  async function captureOcrText() {
    if (!roi || !exactSourceName) return { ok: false, reasonCode: "layout_unconfigured" };
    const sources = await desktopCapturer.getSources({ types: ["window"], thumbnailSize: { width: 1920, height: 1080 }, fetchWindowIcons: false });
    const candidates = sources.filter((source) => source.name === exactSourceName && !source.thumbnail.isEmpty());
    if (candidates.length !== 1) return { ok: false, reasonCode: candidates.length === 0 ? "capture_source_not_found" : "capture_source_ambiguous" };
    const capturedAt = new Date().toISOString();
    const thumbnail = candidates[0].thumbnail;
    const size = thumbnail.getSize();
    let image = thumbnail.crop({ x: Math.floor(size.width * roi.x), y: Math.floor(size.height * roi.y), width: Math.max(1, Math.floor(size.width * roi.width)), height: Math.max(1, Math.floor(size.height * roi.height)) });
    const cropSize = image.getSize();
    if (cropSize.width < 900 && cropSize.height < 500) image = image.resize({ width: Math.min(1800, cropSize.width * 2), quality: "best" });
    ensureHelper();
    const frameId = `${Date.now()}-${++frameSequence}`;
    const imagePath = path.join(userDataPath, "runtime", `hole-frame-${process.pid}.png`);
    await fsp.writeFile(imagePath, image.toPNG());
    try {
      const stdout = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", helperPath, "-ImagePath", imagePath], { windowsHide: true, timeout: 7_000, maxBuffer: 1024 * 1024 });
      return { ok: true, frameId, capturedAt, text: JSON.parse(String(stdout).trim()).text ?? "" };
    } finally {
      await fsp.unlink(imagePath).catch(() => {});
    }
  }

  async function observe(contextState) {
    const active = contextState?.gameState === "playing" && contextState?.gameMode === "regular" && contextState?.roundStatus === "in_progress";
    const contextEpoch = contextState?.contextEpoch ?? null;
    if (!active) {
      resolver.reset(contextEpoch);
      return resolver.snapshot(Date.now(), contextEpoch, false);
    }
    try {
      const captured = await captureOcrText();
      if (!captured.ok) return resolver.addSample({ contextEpoch, frameId: `error-${Date.now()}-${++frameSequence}`, candidate: null, observedAt: new Date().toISOString(), reasonCode: captured.reasonCode });
      const candidates = extractHoleCandidates(captured.text, { allowDigitsOnly });
      return resolver.addSample({ contextEpoch, frameId: captured.frameId, candidate: candidates.length === 1 ? candidates[0] : null, observedAt: captured.capturedAt, reasonCode: candidates.length > 1 ? "recognition_ambiguous" : candidates.length === 0 ? "recognition_rejected" : null });
    } catch (error) {
      const reasonCode = error.killed ? "recognition_timeout" : "recognition_failed";
      onDiagnostic({ event: "hole_recognition_failed", reasonCode, observedAt: new Date().toISOString() });
      return resolver.addSample({ contextEpoch, frameId: `error-${Date.now()}-${++frameSequence}`, candidate: null, observedAt: new Date().toISOString(), reasonCode });
    }
  }
  return { observe, reset: resolver.reset, snapshot: resolver.snapshot, layoutVersion };
}

module.exports = { createHoleResolver, createScreenHoleDetector, extractHoleCandidates, normalizeRoi };
