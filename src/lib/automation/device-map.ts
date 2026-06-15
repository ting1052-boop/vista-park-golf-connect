export type BayAutomationKey = "bay_01" | "bay_02" | "bay_03";
export type AutomationAction = "enter" | "exit";
export type AutomationTestTarget =
  | "ping"
  | "common_on"
  | "common_off"
  | "bay_01_enter"
  | "bay_01_exit"
  | "bay_02_enter"
  | "bay_02_exit"
  | "bay_03_enter"
  | "bay_03_exit"
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
  on: "script.vista_common_on",
  off: "script.vista_common_off"
} as const;

export const siheungBayAutomation: BayAutomationConfig[] = [
  {
    key: "bay_01",
    label: "1번타석",
    bayCodes: ["A-01", "1", "1번타석"],
    enterScript: "script.vista_bay_01_enter",
    exitScript: "script.vista_bay_01_exit",
    devices: [
      { name: "1번타석 PC", provider: "tapo", stateReadable: true, safetyNote: "세션 종료 후 전원 OFF" },
      { name: "1번타석 프로젝터", provider: "hejhome", stateReadable: false },
      { name: "1번타석 리시버", provider: "hejhome", stateReadable: false }
    ]
  },
  {
    key: "bay_02",
    label: "2번타석",
    bayCodes: ["A-02", "2", "2번타석"],
    enterScript: "script.vista_bay_02_enter",
    exitScript: "script.vista_bay_02_exit",
    devices: [
      { name: "2번타석 PC", provider: "tapo", stateReadable: true, safetyNote: "세션 종료 후 전원 OFF" },
      { name: "2번타석 프로젝터", provider: "hejhome", stateReadable: false }
    ]
  },
  {
    key: "bay_03",
    label: "3번타석",
    bayCodes: ["A-03", "B-01", "3", "3번타석"],
    enterScript: "script.vista_bay_03_enter",
    exitScript: "script.vista_bay_03_exit",
    devices: [
      { name: "3번타석 PC", provider: "tapo", stateReadable: true, safetyNote: "세션 종료 후 전원 OFF" },
      { name: "3번타석 프로젝터", provider: "hejhome", stateReadable: false }
    ]
  }
];

export const automationTestScripts: Record<Exclude<AutomationTestTarget, "ping">, string> = {
  common_on: commonAutomationScripts.on,
  common_off: commonAutomationScripts.off,
  bay_01_enter: "script.vista_bay_01_enter",
  bay_01_exit: "script.vista_bay_01_exit",
  bay_02_enter: "script.vista_bay_02_enter",
  bay_02_exit: "script.vista_bay_02_exit",
  bay_03_enter: "script.vista_bay_03_enter",
  bay_03_exit: "script.vista_bay_03_exit",
  test_bay_01_pc_on: "script.vista_test_tapo_bay_01_pc_on",
  test_bay_01_pc_off: "script.vista_test_tapo_bay_01_pc_off"
};

export function getBayAutomationByCode(bayCode: string | null | undefined) {
  if (!bayCode) return null;
  const normalized = bayCode.trim();

  return siheungBayAutomation.find((bay) => bay.bayCodes.includes(normalized)) ?? null;
}
