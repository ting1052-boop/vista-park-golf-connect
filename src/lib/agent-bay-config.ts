// PC 세팅 도구가 Agent 를 설치할 때 쓸 설정 파일 내용을 서버가 만든다.
// 세팅 도구는 이 내용을 해석하지 않고 그대로 파일로 쓴다. 형식의 주인은 서버다.
//
// 파일은 C:\ProgramData\VISTA\agent 에 들어가고, Agent(0.9.6+)가 계정과 무관하게 읽는다.
// DB 를 건드리지 않아 `npx tsx src/lib/agent-bay-config.test.ts` 로 그대로 돌릴 수 있다.

export const AGENT_MACHINE_CONFIG_DIR = "C:\\ProgramData\\VISTA\\agent";
export const AGENT_INSTALL_DIR = "C:\\VISTA";

export type AgentBayEntry = {
  bayCode: string;
  label: string;
  agentId: string;
  agentToken: string;
  monitorOnly?: true;
  gameMonitoringEnabled?: boolean;
  gameProcessNames?: string[];
  gameLogDiagnosticsEnabled?: boolean;
  usageMonitoringEnabled?: boolean;
  usageMonitoringProfile?: "golf_input" | "park_log";
  usageWindowPolicy?: "rolling_60" | "clock_hour";
};

export type AgentInstallFiles = {
  "bays.config.local.json": { bays: AgentBayEntry[] };
  "agent.config.json": { bayCode: string };
};

export function buildAgentInstallFiles(args: {
  storeCode: string;
  storeName: string;
  bayCode: string;
  bayDisplayName: string | null;
  monitorOnly: boolean;
  agentToken: string;
}): AgentInstallFiles {
  // Agent 안에 내장된 bays.config.json 의 "A-01"(시흥) 과 겹치지 않게 매장 코드를 붙인다.
  // 겹치면 내장 항목의 pcName 같은 값이 섞여 들어가 엉뚱한 PC 이름을 보고한다.
  const localBayCode = `${args.storeCode}:${args.bayCode}`;

  const entry: AgentBayEntry = {
    bayCode: localBayCode,
    label: `${args.storeName} · ${args.bayDisplayName?.trim() || args.bayCode}`,
    agentId: `${args.storeCode}-${args.bayCode}`.toLowerCase(),
    agentToken: args.agentToken
  };

  if (args.monitorOnly) {
    // 아파트 매장: 고객 화면·세션 종료·자동 PC 종료는 끄지만, 사용 감지와 타석 제어는 유지한다.
    entry.monitorOnly = true;
    if (args.storeCode.toUpperCase() === "VISTA-XII") {
      if (/^P-0[12]$/i.test(args.bayCode)) {
        entry.gameMonitoringEnabled = true;
        entry.gameProcessNames = ["ScreenGolf.exe"];
        entry.gameLogDiagnosticsEnabled = true;
        entry.usageMonitoringEnabled = true;
        entry.usageMonitoringProfile = "park_log";
        entry.usageWindowPolicy = "clock_hour";
      } else if (/^A-0[1-7]$/i.test(args.bayCode)) {
        entry.usageMonitoringEnabled = true;
        entry.usageMonitoringProfile = "golf_input";
        entry.usageWindowPolicy = "clock_hour";
      }
    }
  }

  return {
    "bays.config.local.json": { bays: [entry] },
    "agent.config.json": { bayCode: localBayCode }
  };
}
