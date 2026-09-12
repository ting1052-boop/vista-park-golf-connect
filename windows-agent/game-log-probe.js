/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");

const DEFAULT_EXTENSIONS = [".log", ".txt", ".csv", ".json"];

function fileId(filePath) {
  return createHash("sha256").update(filePath.toLowerCase()).digest("hex").slice(0, 12);
}

function findSignals(text) {
  const holes = new Set();
  const holePatterns = [
    /(?:hole|홀)\s*(?:no\.?|number|#|:|=|-)?\s*(\d{1,2})/giu,
    /(\d{1,2})\s*(?:번\s*)?(?:hole|홀)/giu
  ];

  for (const pattern of holePatterns) {
    for (const match of text.matchAll(pattern)) {
      const value = Number(match[1]);
      if (Number.isInteger(value) && value >= 1 && value <= 99) holes.add(value);
    }
  }

  const signals = [];
  if (holes.size > 0) signals.push("hole_candidate");
  if (
    /(?:round|라운드).{0,20}(?:start|started|begin|began|시작)|(?:start|started|begin|began|시작).{0,20}(?:round|라운드)|GameManager::EnterNewHole:\s*Open New Level/iu.test(
      text
    )
  ) {
    signals.push("round_start_candidate");
  }
  if (
    /(?:round|라운드).{0,20}(?:end|ended|finish|finished|complete|completed|종료|완료)|(?:end|ended|finish|finished|complete|completed|종료|완료).{0,20}(?:round|라운드)|CGameContext::IsEndedHole:.*State:\s*1/iu.test(
      text
    )
  ) {
    signals.push("round_end_candidate");
  }
  if (/(?:main\s*menu|lobby|메인\s*메뉴|대기\s*화면)/iu.test(text)) {
    signals.push("menu_candidate");
  }

  return { signals, holeCandidates: [...holes].slice(0, 20) };
}

async function listCandidateFiles(root, extensions, maxDepth, maxFiles) {
  const found = [];

  async function visit(directory, depth) {
    if (found.length >= maxFiles || depth > maxDepth) return;
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (found.length >= maxFiles) break;
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath, depth + 1);
      } else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) {
        found.push(entryPath);
      }
    }
  }

  await visit(root, 0);
  return found;
}

async function readChangedBytes(filePath, previousSize, currentSize, maxReadBytes) {
  const grew = currentSize > previousSize;
  const start = grew ? Math.max(previousSize, currentSize - maxReadBytes) : Math.max(0, currentSize - maxReadBytes);
  const length = Math.max(0, Math.min(maxReadBytes, currentSize - start));
  if (length === 0) return Buffer.alloc(0);

  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    const result = await handle.read(buffer, 0, length, start);
    return buffer.subarray(0, result.bytesRead);
  } finally {
    await handle.close();
  }
}

function createGameLogProbe(options = {}) {
  const directories = Array.isArray(options.directories) ? options.directories.filter(Boolean) : [];
  const extensions = new Set(
    (Array.isArray(options.extensions) && options.extensions.length > 0 ? options.extensions : DEFAULT_EXTENSIONS).map(
      (extension) => (String(extension).startsWith(".") ? String(extension) : `.${extension}`).toLowerCase()
    )
  );
  const maxDepth = Math.max(0, Math.min(4, Number(options.maxDepth ?? 2)));
  const maxFiles = Math.max(1, Math.min(500, Number(options.maxFiles ?? 100)));
  const maxReadBytes = Math.max(1_024, Math.min(131_072, Number(options.maxReadBytes ?? 32_768)));
  const onDiagnostic = typeof options.onDiagnostic === "function" ? options.onDiagnostic : () => {};
  const tracked = new Map();
  let baselineReady = false;
  let scanInProgress = false;

  async function scan() {
    if (scanInProgress) return { skipped: true };
    scanInProgress = true;
    try {
      const files = [];
      for (const directory of directories) {
        const remaining = maxFiles - files.length;
        if (remaining <= 0) break;
        files.push(...(await listCandidateFiles(directory, extensions, maxDepth, remaining)));
      }

      const currentPaths = new Set(files);
      let changedFiles = 0;
      for (const candidatePath of files) {
        let stat;
        try {
          stat = await fs.stat(candidatePath);
        } catch {
          continue;
        }

        const previous = tracked.get(candidatePath);
        tracked.set(candidatePath, { size: stat.size, mtimeMs: stat.mtimeMs });
        if (!baselineReady || (previous && previous.size === stat.size && previous.mtimeMs === stat.mtimeMs)) continue;

        changedFiles += 1;
        try {
          const previousSize = previous?.size ?? 0;
          const bytes = await readChangedBytes(candidatePath, previousSize, stat.size, maxReadBytes);
          const nulCount = bytes.reduce((count, byte) => count + (byte === 0 ? 1 : 0), 0);
          if (bytes.length > 0 && nulCount / bytes.length > 0.01) {
            onDiagnostic({
              event: "file_changed",
              fileId: fileId(candidatePath),
              extension: path.extname(candidatePath).toLowerCase(),
              changeType: previous && stat.size < previous.size ? "reset" : previous ? "updated" : "created",
              bytesInspected: bytes.length,
              signals: ["text_unreadable"],
              holeCandidates: [],
              observedAt: new Date().toISOString()
            });
            continue;
          }

          const detected = findSignals(bytes.toString("utf8"));
          onDiagnostic({
            event: "file_changed",
            fileId: fileId(candidatePath),
            extension: path.extname(candidatePath).toLowerCase(),
            changeType: previous && stat.size < previous.size ? "reset" : previous ? "updated" : "created",
            bytesInspected: bytes.length,
            signals: detected.signals,
            holeCandidates: detected.holeCandidates,
            observedAt: new Date().toISOString()
          });
        } catch (error) {
          onDiagnostic({
            event: "file_read_failed",
            fileId: fileId(candidatePath),
            errorCode: error?.code ?? "unknown",
            observedAt: new Date().toISOString()
          });
        }
      }

      for (const trackedPath of tracked.keys()) {
        if (!currentPaths.has(trackedPath)) tracked.delete(trackedPath);
      }

      if (!baselineReady) {
        baselineReady = true;
        onDiagnostic({
          event: "baseline_ready",
          directoryCount: directories.length,
          trackedFileCount: tracked.size,
          observedAt: new Date().toISOString()
        });
      }

      return { skipped: false, trackedFiles: tracked.size, changedFiles };
    } finally {
      scanInProgress = false;
    }
  }

  return { scan };
}

module.exports = { createGameLogProbe, findSignals };
