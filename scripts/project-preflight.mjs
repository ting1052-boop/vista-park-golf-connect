import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const handoffPath = path.join(root, "docs", "SHARED-HANDOFF.md");

function git(args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8"
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || `git ${args.join(" ")} failed`);
  }

  return result.stdout?.trimEnd() ?? "";
}

const handoff = readFileSync(handoffPath, "utf8");
const branch = git(["branch", "--show-current"]);
const latest = git(["log", "-1", "--oneline"]);
const status = git(["status", "--short"]);

console.log("=== VISTA SHARED HANDOFF ===");
console.log(handoff);
console.log("\n=== GIT SNAPSHOT ===");
console.log(`Branch: ${branch}`);
console.log(`Latest: ${latest}`);
console.log(status || "Working tree clean");
