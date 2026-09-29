import test from "node:test";
import assert from "node:assert/strict";
import { hashControllerToken, readBearerToken, resolveControllerAuth } from "./store-controller-auth";

const SIHEUNG = "11111111-1111-4111-8111-111111111111";
const SONGDO = "b2f7192b-9472-4006-a58d-ffec3afc90ce";
const GLOBAL = "global-token-for-siheung-0123456789";
const SONGDO_TOKEN = "songdo-only-token-abcdefghijklmnopqrstuvwxyz";

// 송도 토큰 하나만 등록된 것처럼 동작하는 가짜 조회
const lookup = async (hash: string) => (hash === hashControllerToken(SONGDO_TOKEN) ? SONGDO : null);

test("the global token keeps working and picks the store from the header", async () => {
  const auth = await resolveControllerAuth({ received: GLOBAL, globalToken: GLOBAL, headerStoreId: SIHEUNG, lookupStoreByTokenHash: lookup });
  assert.deepEqual(auth, { ok: true, storeId: SIHEUNG, scoped: false });
});

test("a store token fixes the store and ignores the x-store-id header", async () => {
  // 송도 토큰으로 시흥 매장 ID 를 헤더에 넣어도 송도로 고정돼야 한다
  const auth = await resolveControllerAuth({ received: SONGDO_TOKEN, globalToken: GLOBAL, headerStoreId: SIHEUNG, lookupStoreByTokenHash: lookup });
  assert.deepEqual(auth, { ok: true, storeId: SONGDO, scoped: true });
});

test("unknown, empty and wrong-length tokens are rejected", async () => {
  for (const received of ["", "nope", GLOBAL + "x", SONGDO_TOKEN.slice(1)]) {
    const auth = await resolveControllerAuth({ received, globalToken: GLOBAL, headerStoreId: SIHEUNG, lookupStoreByTokenHash: lookup });
    assert.equal(auth.ok, false, `"${received}" 가 통과했다`);
  }
});

test("without a global token only registered store tokens pass", async () => {
  const noGlobal = { globalToken: undefined, headerStoreId: SIHEUNG, lookupStoreByTokenHash: lookup };
  assert.equal((await resolveControllerAuth({ ...noGlobal, received: GLOBAL })).ok, false);
  assert.equal((await resolveControllerAuth({ ...noGlobal, received: SONGDO_TOKEN })).ok, true);
});

test("a failing lookup (table missing before the migration) denies but never throws", async () => {
  const broken = async () => null;
  const auth = await resolveControllerAuth({ received: SONGDO_TOKEN, globalToken: GLOBAL, headerStoreId: SIHEUNG, lookupStoreByTokenHash: broken });
  assert.equal(auth.ok, false);
  // 전역 토큰은 조회와 무관하게 통과해야 한다(시흥이 마이그레이션 전에도 멈추지 않는다)
  const still = await resolveControllerAuth({ received: GLOBAL, globalToken: GLOBAL, headerStoreId: SIHEUNG, lookupStoreByTokenHash: broken });
  assert.equal(still.ok, true);
});

test("only the SHA-256 of a token is ever compared, never the token itself", () => {
  const hash = hashControllerToken(SONGDO_TOKEN);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash.includes(SONGDO_TOKEN), false);
});

test("bearer parsing", () => {
  assert.equal(readBearerToken("Bearer abc "), "abc");
  assert.equal(readBearerToken("Basic abc"), "");
  assert.equal(readBearerToken(null), "");
});
