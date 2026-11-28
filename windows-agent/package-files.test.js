/* eslint-disable @typescript-eslint/no-require-imports */
// 0.10.2 는 build.files 에 적힌 golf-input-snapshot.ps1 이 저장소에 없어서 그 파일 없이 빌드됐다.
// electron-builder 는 없는 파일을 조용히 건너뛰므로, 송도 골프 7대의 이용 감지가 전부 멈췄다(2026-11-28).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const files = require("./package.json").build.files.filter((entry) => !entry.includes("*"));
const missing = files.filter((entry) => !fs.existsSync(path.join(__dirname, entry)));
assert.deepEqual(missing, [], `빌드 목록에 있지만 저장소에 없는 파일: ${missing.join(", ")}`);
console.log(`package files ok (${files.length})`);
