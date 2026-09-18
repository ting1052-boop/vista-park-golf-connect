/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");

// 게임 설치 폴더 이름에 설치 날짜가 들어간다(C:\PARK_260529-VISTA, C:\PARK_260713-VISTA).
// 재설치할 때마다 폴더가 바뀌므로 로그 경로를 고정해 두면 조용히 어긋난다.
// 실제로 2026-09-18 에 Agent 가 260713 을 보는 동안 게임은 260529 에서 돌아,
// 몇 시간 동안 아무 상태도 잡히지 않았다.
//
// 그래서 후보 경로를 모아 두고 "가장 최근에 쓰인 로그"를 따라간다.
// 게임을 다른 폴더로 재설치해도 Agent 설정을 고칠 필요가 없다.

const DIRECTORY_CACHE_MS = 60_000;
const RUNNING_PATH_CACHE_MS = 30_000;

/**
 * 실행 중인 게임 실행파일 경로를 읽는다.
 *
 * 수정일만으로 로그를 고르면 위험하다. 2026-09-18 현장 확인 결과 시작프로그램과
 * 바탕화면 바로가기가 서로 다른 설치본(260529 / 260713)을 가리키고 있어, 어느
 * 쪽이 뜰지 실행할 때마다 달라질 수 있다. 실제로 돌고 있는 프로세스의 경로가
 * 가장 확실한 근거다.
 */
async function readRunningGamePaths(processNames) {
  const names = processNames.filter((name) => /^[A-Za-z0-9_.-]+$/u.test(name));
  if (names.length === 0) return [];

  const filter = names.map((name) => `Name='${name}'`).join(" or ");
  const command = `Get-CimInstance Win32_Process -Filter "${filter}" | ForEach-Object { $_.ExecutablePath }`;

  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command],
      { windowsHide: true, timeout: 5_000, maxBuffer: 256 * 1024 },
      (error, stdout) => {
        if (error) return resolve([]);
        resolve(
          String(stdout)
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
        );
      }
    );
  });
}

/**
 * 한 경로 구간에 `*` 하나가 들어간 패턴을 실제 경로 목록으로 펼친다.
 * 예: C:\PARK_*-VISTA\ScreenGolf\Saved\Logs\ScreenGolf.log
 */
async function expandPattern(pattern) {
  const star = pattern.indexOf("*");
  if (star < 0) return [pattern];

  const before = pattern.slice(0, star);
  const after = pattern.slice(star + 1);
  const parentEnd = Math.max(before.lastIndexOf("\\"), before.lastIndexOf("/"));
  if (parentEnd < 0) return [];

  const parent = before.slice(0, parentEnd);
  const prefix = before.slice(parentEnd + 1);
  const restStart = after.search(/[\\/]/u);
  const suffix = restStart < 0 ? after : after.slice(0, restStart);
  const rest = restStart < 0 ? "" : after.slice(restStart + 1);

  let entries;
  try {
    entries = await fs.readdir(parent, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name.length >= prefix.length + suffix.length)
    .filter((name) => name.toLowerCase().startsWith(prefix.toLowerCase()))
    .filter((name) => name.toLowerCase().endsWith(suffix.toLowerCase()))
    .map((name) => (rest ? path.join(parent, name, rest) : path.join(parent, name)));
}

/**
 * 로그 파일이 실행 중인 실행파일과 얼마나 깊은 상위 폴더를 공유하는지.
 * 폴더 구조를 가정하지 않으려고 로그에서 위로 올라가며 비교한다.
 * 같은 설치본이면 깊은 곳에서 만나고, 남남이면 드라이브 근처에서야 만난다.
 */
function sharedDepthWithRunning(candidatePath, exePaths) {
  if (exePaths.length === 0) return 0;

  const lowerExes = exePaths.map((value) => path.resolve(value).toLowerCase());
  let directory = path.dirname(path.resolve(candidatePath));

  for (;;) {
    const prefix = directory.toLowerCase() + path.sep;
    if (lowerExes.some((exe) => exe.startsWith(prefix))) {
      return directory.split(path.sep).filter(Boolean).length;
    }

    const parent = path.dirname(directory);
    if (parent === directory) return 0;
    directory = parent;
  }
}

function createGameLogLocator(options = {}) {
  const explicit = [options.logFile, ...(Array.isArray(options.logFiles) ? options.logFiles : [])]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
  const patterns = (Array.isArray(options.patterns) ? options.patterns : [])
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());

  const processNames = (Array.isArray(options.processNames) ? options.processNames : ["ScreenGolf.exe"]).filter(
    (value) => typeof value === "string" && value.trim().length > 0
  );
  const readRunningPaths = typeof options.readRunningPaths === "function" ? options.readRunningPaths : readRunningGamePaths;

  let cachedCandidates = null;
  let cachedAt = 0;
  let cachedRunningRoots = null;
  let cachedRunningRootsAt = 0;

  async function candidates() {
    const now = Date.now();
    if (cachedCandidates && now - cachedAt < DIRECTORY_CACHE_MS) return cachedCandidates;

    const expanded = [];
    for (const pattern of patterns) expanded.push(...(await expandPattern(pattern)));

    cachedCandidates = [...new Set([...explicit, ...expanded])];
    cachedAt = now;
    return cachedCandidates;
  }

  async function runningRoots() {
    const now = Date.now();
    if (cachedRunningRoots && now - cachedRunningRootsAt < RUNNING_PATH_CACHE_MS) return cachedRunningRoots;

    cachedRunningRoots = await readRunningPaths(processNames);
    cachedRunningRootsAt = now;
    return cachedRunningRoots;
  }

  /**
   * 쓸 로그 파일 하나를 고른다.
   * 실행 중인 게임과 같은 설치본의 로그를 우선하고, 그런 후보가 없을 때만
   * 가장 최근에 쓰인 로그로 넘어간다.
   */
  async function resolve() {
    const found = [];

    for (const candidate of await candidates()) {
      try {
        const stat = await fs.stat(candidate);
        if (stat.isFile()) found.push({ path: candidate, mtimeMs: stat.mtimeMs });
      } catch {
        // 없는 후보는 건너뛴다. 재설치 전 폴더가 남아 있을 수 있다.
      }
    }

    if (found.length === 0) return null;
    if (found.length === 1) return found[0].path;

    const exePaths = await runningRoots();
    const scored = found.map((entry) => ({ ...entry, depth: sharedDepthWithRunning(entry.path, exePaths) }));
    const deepest = Math.max(...scored.map((entry) => entry.depth));

    // 실행 중인 게임과 가장 깊은 폴더를 공유하는 후보만 남긴다.
    // 실행 정보를 못 얻었으면(모두 0) 예전처럼 최근 수정 기준으로 고른다.
    const pool = deepest > 0 ? scored.filter((entry) => entry.depth === deepest) : scored;
    return pool.reduce((best, entry) => (entry.mtimeMs > best.mtimeMs ? entry : best)).path;
  }

  return { resolve, candidates };
}

module.exports = { createGameLogLocator, expandPattern };
