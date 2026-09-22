import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAnydeskId, parseRegisterPayload, redactForLog } from "./pc-registry-payload.ts";

const valid = {
  deviceId: "a".repeat(64),
  storeCode: "SIHEUNG-PARK",
  bayCode: "A-02",
  pcType: "park",
  computerName: "PARK01",
  anydeskId: "123456789",
  windowsEdition: "Windows 11 IoT Enterprise",
  windowsVersion: "24H2 (26100.2033)",
  activationStatus: "licensed",
  setupToolVersion: "3.4.0"
};

test("정상 요청을 해석한다", () => {
  const result = parseRegisterPayload(valid);
  assert.ok(result.ok);
  assert.equal(result.payload.deviceId, "a".repeat(64));
  assert.equal(result.payload.bayCode, "A-02");
  assert.equal(result.payload.replace, false, "replace 를 생략하면 교체하지 않는다");
});

test("비밀번호와 제품키는 조용히 버리지 않고 거절한다", () => {
  for (const field of ["password", "windowsProductKey", "anydeskPassword"]) {
    const result = parseRegisterPayload({ ...valid, [field]: "x" });
    assert.ok(!result.ok);
    assert.equal(result.error.code, "forbidden_field");
    assert.equal(result.error.field, field);
  }
});

test("운영자가 화면에 보이는 대로 적은 AnyDesk 주소를 받아들인다", () => {
  assert.equal(normalizeAnydeskId("123 456 789"), "123456789");
  assert.equal(normalizeAnydeskId("123456789@ad"), "123456789");
  assert.equal(normalizeAnydeskId(123456789), "123456789");
  assert.equal(normalizeAnydeskId("12345"), null, "너무 짧은 값은 받지 않는다");
  assert.equal(normalizeAnydeskId("abcdefghi"), null);
});

test("매장과 타석은 둘 중 하나의 식별자가 반드시 있어야 한다", () => {
  const noStore = parseRegisterPayload({ ...valid, storeCode: undefined });
  assert.ok(!noStore.ok);
  assert.equal(noStore.error.field, "storeId");

  const noBay = parseRegisterPayload({ ...valid, bayCode: undefined });
  assert.ok(!noBay.ok);
  assert.equal(noBay.error.field, "bayId");
});

test("잘못된 값은 어느 항목인지 알려준다", () => {
  const cases: Array<[Record<string, unknown>, string]> = [
    [{ deviceId: "short" }, "deviceId"],
    [{ pcType: "golf" }, "pcType"],
    [{ computerName: "-PARK01" }, "computerName"],
    [{ computerName: "PARK 01" }, "computerName"],
    [{ anydeskId: "12" }, "anydeskId"],
    [{ activationStatus: "maybe" }, "activationStatus"],
    [{ replace: "yes" }, "replace"]
  ];

  for (const [override, field] of cases) {
    const result = parseRegisterPayload({ ...valid, ...override });
    assert.ok(!result.ok, `${field} 은 거절되어야 한다`);
    assert.equal(result.error.field, field);
  }
});

test("로그에는 장비 식별자 앞부분만 남긴다", () => {
  const logged = redactForLog({ deviceId: "a".repeat(64) });
  assert.equal(logged.deviceIdPrefix, "aaaaaaaa…");
  assert.equal(Object.keys(logged).length, 1, "다른 필드가 로그로 새어 나가면 안 된다");
});

test("WOL 네트워크 정보를 정규화하고 브로드캐스트를 검증한다", () => {
  const result = parseRegisterPayload({
    ...valid,
    wolMacAddress: "aa:bb:cc:dd:ee:ff",
    macAddresses: [
      { address: "AA-BB-CC-DD-EE-FF", type: "ethernet", name: "Intel Ethernet" },
      { address: "11:22:33:44:55:66", type: "wifi", name: "Intel Wi-Fi" }
    ],
    ipv4Address: "192.168.0.25",
    networkPrefixLength: 24,
    wolBroadcastAddress: "192.168.0.255",
    wakeOnLanStatus: "enabled",
    powerControlMethod: "wol_agent",
    networkCollectedAt: "2026-09-22T12:00:00.000Z"
  });
  assert.ok(result.ok);
  assert.equal(result.payload.wolMacAddress, "AABBCCDDEEFF");
  assert.equal(result.payload.macAddresses.length, 2);
  assert.equal(result.payload.wolBroadcastAddress, "192.168.0.255");
});

test("대표 MAC이 목록에 없거나 브로드캐스트가 틀리면 거절한다", () => {
  const noMac = parseRegisterPayload({
    ...valid,
    wolMacAddress: "AABBCCDDEEFF",
    macAddresses: []
  });
  assert.ok(!noMac.ok);
  assert.equal(noMac.error.field, "wolMacAddress");

  const badBroadcast = parseRegisterPayload({
    ...valid,
    wolMacAddress: "AABBCCDDEEFF",
    macAddresses: [{ address: "AABBCCDDEEFF", type: "ethernet", name: "Ethernet" }],
    ipv4Address: "192.168.0.25",
    networkPrefixLength: 24,
    wolBroadcastAddress: "192.168.1.255"
  });
  assert.ok(!badBroadcast.ok);
  assert.equal(badBroadcast.error.field, "wolBroadcastAddress");
});
