import test from "node:test";
import assert from "node:assert/strict";
import { isAdminRole } from "./admin-context";

// 핵심: 역할이 없으면 관리자가 아니다(기본 거부). 고객 카카오 로그인도 같은
// 계정 체계라, 로그인만으로 본사관리자가 되면 안 된다.
test("only the three admin roles pass", () => {
  assert.equal(isAdminRole("head_admin"), true);
  assert.equal(isAdminRole("store_manager"), true);
  assert.equal(isAdminRole("staff"), true);
});

test("member and unknown roles are denied", () => {
  for (const role of ["member", "", "admin", "owner", "HEAD_ADMIN"]) {
    assert.equal(isAdminRole(role), false, `${role} 는 거부돼야 한다`);
  }
});

test("null and undefined are denied", () => {
  assert.equal(isAdminRole(null), false);
  assert.equal(isAdminRole(undefined), false);
});
