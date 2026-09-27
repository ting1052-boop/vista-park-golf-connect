// PC 세팅 도구가 내려받을 Agent 실행파일.
//
// 새 버전 배포 순서:
//   1. windows-agent 에서 npm run dist:portable
//   2. GitHub 릴리스 agent-v<버전> 에 VISTA-Bay-Agent.exe 업로드
//   3. 아래 세 값을 바꿔 커밋·배포
//
// 세팅 도구는 받은 파일의 SHA-256 을 반드시 이 값과 대조하고, 다르면 설치하지 않는다.
export const AGENT_RELEASE = {
  version: "0.9.6",
  url: "https://github.com/ting1052-boop/vista-park-golf-connect/releases/download/agent-v0.9.6/VISTA-Bay-Agent.exe",
  sha256: "AA5E2866AEB6E3C86B1C24542DDE3EA0355C1FC2E83273B05B5E702A3E7D5DCB"
} as const;
