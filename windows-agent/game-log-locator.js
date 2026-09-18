/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("node:fs/promises");
const path = require("node:path");

// 게임 설치 폴더 이름에 설치 날짜가 들어간다(C:\PARK_260529-VISTA, C:\PARK_260713-VISTA).
// 재설치할 때마다 폴더가 바뀌므로 로그 경로를 고정해 두면 조용히 어긋난다.
// 실제로 2026-09-18 에 Agent 가 260713 을 보는 동안 게임은 260529 에서 돌아,
// 몇 시간 동안 아무 상태도 잡히지 않았다.
//
// 그래서 후보 경로를 모아 두고 "가장 최근에 쓰인 로그"를 따라간다.
// 게임을 다른 폴더로 재설치해도 Agent 설정을 고칠 필요가 없다.

const DIRECTORY_CACHE_MS = 60_000;

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

function createGameLogLocator(options = {}) {
  const explicit = [options.logFile, ...(Array.isArray(options.logFiles) ? options.logFiles : [])]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
  const patterns = (Array.isArray(options.patterns) ? options.patterns : [])
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());

  let cachedCandidates = null;
  let cachedAt = 0;

  async function candidates() {
    const now = Date.now();
    if (cachedCandidates && now - cachedAt < DIRECTORY_CACHE_MS) return cachedCandidates;

    const expanded = [];
    for (const pattern of patterns) expanded.push(...(await expandPattern(pattern)));

    cachedCandidates = [...new Set([...explicit, ...expanded])];
    cachedAt = now;
    return cachedCandidates;
  }

  /** 존재하는 후보 중 가장 최근에 쓰인 로그. 없으면 null. */
  async function resolve() {
    let best = null;

    for (const candidate of await candidates()) {
      try {
        const stat = await fs.stat(candidate);
        if (!stat.isFile()) continue;
        if (!best || stat.mtimeMs > best.mtimeMs) best = { path: candidate, mtimeMs: stat.mtimeMs };
      } catch {
        // 없는 후보는 건너뛴다. 재설치 전 폴더가 남아 있을 수 있다.
      }
    }

    return best ? best.path : null;
  }

  return { resolve, candidates };
}

module.exports = { createGameLogLocator, expandPattern };
