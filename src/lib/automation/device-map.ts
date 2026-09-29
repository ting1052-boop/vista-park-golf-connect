export type BayAutomationKey = "bay_01" | "bay_02" | "bay_03";
export type AutomationAction = "enter" | "exit";
export type AutomationTestTarget =
  | "ping"
  | "shared_on"
  | "shared_off"
  | "common_on"
  | "common_off"
  | "bay1_on"
  | "bay1_off"
  | "bay2_on"
  | "bay2_off"
  | "bay3_on"
  | "bay3_off"
  | "test_bay_01_pc_on"
  | "test_bay_01_pc_off";

export type BayAutomationConfig = {
  key: BayAutomationKey;
  label: string;
  bayCodes: string[];
  enterScript: string;
  exitScript: string;
  devices: Array<{
    name: string;
    provider: "tapo" | "hejhome";
    stateReadable: boolean;
    safetyNote?: string;
  }>;
};

export const commonAutomationScripts = {
  on: "script.shared_on",
  off: "script.shared_off"
} as const;

export const siheungBayAutomation: BayAutomationConfig[] = [
  {
    key: "bay_01",
    label: "1번타석",
    bayCodes: ["A-01", "1", "1번타석"],
    enterScript: "script.bay1_on",
    exitScript: "script.bay1_off",
    devices: [
      { name: "1번타석 PC", provider: "tapo", stateReadable: true, safetyNote: "WOL로 부팅, 세션 종료 후 전원 OFF" },
      { name: "1번타석 TV 모니터", provider: "hejhome", stateReadable: false },
      { name: "1번타석 데논 리시버", provider: "hejhome", stateReadable: false },
      { name: "1번타석 프로젝터", provider: "hejhome", stateReadable: false }
    ]
  },
  {
    key: "bay_02",
    label: "2번타석",
    bayCodes: ["A-02", "2", "2번타석"],
    enterScript: "script.bay2_on",
    exitScript: "script.bay2_off",
    devices: [
      { name: "2번타석 PC", provider: "tapo", stateReadable: true, safetyNote: "세션 종료 후 전원 OFF" },
      { name: "2번타석 프로젝터", provider: "hejhome", stateReadable: false }
    ]
  },
  {
    key: "bay_03",
    label: "3번타석",
    bayCodes: ["A-03", "B-01", "3", "3번타석"],
    enterScript: "script.bay3_on",
    exitScript: "script.bay3_off",
    devices: [
      { name: "3번타석 PC", provider: "tapo", stateReadable: true, safetyNote: "세션 종료 후 전원 OFF" },
      { name: "3번타석 프로젝터", provider: "hejhome", stateReadable: false }
    ]
  }
];

export const automationTestScripts: Record<Exclude<AutomationTestTarget, "ping">, string> = {
  shared_on: commonAutomationScripts.on,
  shared_off: commonAutomationScripts.off,
  common_on: commonAutomationScripts.on,
  common_off: commonAutomationScripts.off,
  bay1_on: "script.bay1_on",
  bay1_off: "script.bay1_off",
  bay2_on: "script.bay2_on",
  bay2_off: "script.bay2_off",
  bay3_on: "script.bay3_on",
  bay3_off: "script.bay3_off",
  test_bay_01_pc_on: "script.test_bay1_pc_on",
  test_bay_01_pc_off: "script.test_bay1_pc_off"
};

export const allowedAutomationTestScripts = new Set<string>(Object.values(automationTestScripts));

// 위 장비표는 시흥점 전용이다. 타석 코드(A-01 등)는 매장마다 겹치므로 코드만 보고
// 찾으면 다른 매장의 A-01 이 시흥 1번 타석 장비 명령을 받는다. 송도에서 매장 종료를
// 누를 때마다 시흥 스크립트가 송도 매장 이름으로 쌓이던 원인이다.
// storeId 를 필수로 받아, 호출하는 쪽이 매장을 빠뜨릴 수 없게 한다.
export const SIHEUNG_STORE_ID = "11111111-1111-4111-8111-111111111111";

export function getBayAutomationByCode(bayCode: string | null | undefined, storeId: string | null | undefined) {
  if (!bayCode || storeId !== SIHEUNG_STORE_ID) return null;
  const normalized = bayCode.trim();

  return siheungBayAutomation.find((bay) => bay.bayCodes.includes(normalized)) ?? null;
}
