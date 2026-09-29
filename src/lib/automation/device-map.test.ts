import test from "node:test";
import assert from "node:assert/strict";
import { getBayAutomationByCode, SIHEUNG_STORE_ID } from "./device-map";

// 타석 코드(A-01 등)는 매장마다 겹친다. 장비 연결표는 시흥 전용이라, 매장을 확인하지
// 않으면 송도의 A-01 이 시흥 1번 타석 장비 명령(script.bay1_*)을 받는다.
const SONGDO_STORE_ID = "b2f7192b-9472-4006-a58d-ffec3afc90ce";

test("Siheung bays resolve to their own equipment", () => {
  assert.equal(getBayAutomationByCode("A-01", SIHEUNG_STORE_ID)?.enterScript, "script.bay1_on");
  assert.equal(getBayAutomationByCode("A-02", SIHEUNG_STORE_ID)?.exitScript, "script.bay2_off");
  assert.equal(getBayAutomationByCode("A-03", SIHEUNG_STORE_ID)?.key, "bay_03");
});

test("the same bay code in another store gets no Siheung equipment", () => {
  for (const code of ["A-01", "A-02", "A-03", "1", "2", "3"]) {
    assert.equal(getBayAutomationByCode(code, SONGDO_STORE_ID), null, `송도 ${code} 가 시흥 장비에 연결됐다`);
  }
});

test("a missing store never matches", () => {
  assert.equal(getBayAutomationByCode("A-01", null), null);
  assert.equal(getBayAutomationByCode("A-01", undefined), null);
  assert.equal(getBayAutomationByCode(null, SIHEUNG_STORE_ID), null);
});
