import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// /api/admin/** 는 전부 역할 검사를 거쳐야 한다. requireAdminUser() 는 로그인만 확인하므로,
// Supabase 공개 가입이 열려 있으면 아무 계정이나 통과한다(2026-11 원격접속·요금정책 API 가 그랬다).
// 새 관리자 API 가 이 규칙을 빠뜨리면 여기서 실패한다.
const root = fileURLToPath(new URL("../src/app/api/admin/", import.meta.url));

function routeFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.name === "route.ts" ? [full] : [];
  });
}

const files = routeFiles(root);
assert.ok(files.length >= 8, `관리자 API 가 ${files.length}개뿐이다. 경로가 바뀌었는지 확인`);

const roleGuard = /\b(getAdminContext|getOptionalAdminContext)\(/;
// 본사 전용으로 정한 API. 매장관리자 메뉴에 없는 화면(원격접속·타석관리·요금설정)이 쓴다.
const headOnly = ["remote-access", "store-policy"];

for (const file of files) {
  const name = path.relative(root, path.dirname(file)).replaceAll(path.sep, "/");
  const source = fs.readFileSync(file, "utf8");

  assert.ok(!/\brequireAdminUser\(/.test(source), `${name}: requireAdminUser() 는 로그인만 확인한다. getAdminContext 계열을 쓸 것`);
  assert.ok(roleGuard.test(source), `${name}: 역할 검사(getAdminContext/getOptionalAdminContext)가 없다`);

  if (headOnly.includes(name)) {
    assert.ok(/\bisHeadAdmin\b/.test(source), `${name}: 본사 전용 API 인데 isHeadAdmin 확인이 없다`);
    // 모든 처리 함수가 가드를 먼저 부르는지 본다.
    for (const handler of source.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\([^)]*\)\s*\{([\s\S]*?)\n\}/g)) {
      const head = handler[2].split("\n").slice(0, 4).join("\n");
      assert.ok(/ensure(Head)?Admin\(\)/.test(head), `${name} ${handler[1]}: 처리 첫머리에 본사 가드가 없다`);
    }
  }
}

console.log(`Admin API guards: ${files.length} routes use role checks; ${headOnly.join(", ")} are head-office only.`);
