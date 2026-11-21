// PC 세팅 도구가 내려받을 Agent 실행파일.
//
// 새 버전 배포 순서:
//   1. windows-agent 에서 npm run dist:portable
//   2. GitHub 릴리스 agent-v<버전> 에 VISTA-Bay-Agent.exe 업로드
//   3. 아래 세 값을 바꿔 커밋·배포
//
// 세팅 도구는 받은 파일의 SHA-256 을 반드시 이 값과 대조하고, 다르면 설치하지 않는다.
export type AgentRelease = {
  version: string;
  url: string;
  sha256: string;
};

export const AGENT_RELEASE = {
  version: "0.9.8",
  url: "https://github.com/ting1052-boop/vista-park-golf-connect/releases/download/agent-v0.9.8/VISTA-Bay-Agent.exe",
  sha256: "4D02BE6C1C4EAC2D64709B9B8C6116A577949052E5769084824827F761DF0765"
} as const;

export const AGENT_RELEASES: { default: AgentRelease; roundCounting: AgentRelease | null } = {
  default: AGENT_RELEASE,
  roundCounting: {
    version: "0.10.0",
    url: "https://github.com/ting1052-boop/vista-park-golf-connect/releases/download/agent-v0.10.0/VISTA-Bay-Agent.exe",
    sha256: "31B06623B6FABDD846B2F14D0823732899E77894EEA704B4694FE975AAEEE185"
  }
};

export function getAgentRelease(roundCounting: boolean) {
  return roundCounting ? AGENT_RELEASES.roundCounting : AGENT_RELEASES.default;
}
