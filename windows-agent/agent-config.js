function mergeBaysConfig(baseConfig = {}, localConfig = {}) {
  const baseBays = Array.isArray(baseConfig.bays) ? baseConfig.bays : [];
  const localBays = Array.isArray(localConfig.bays) ? localConfig.bays : [];
  const localByCode = new Map(localBays.map((bay) => [bay.bayCode, bay]));
  const mergedBays = baseBays.map((bay) => ({ ...bay, ...(localByCode.get(bay.bayCode) ?? {}) }));
  const knownCodes = new Set(baseBays.map((bay) => bay.bayCode));

  for (const bay of localBays) {
    if (!knownCodes.has(bay.bayCode)) mergedBays.push(bay);
  }

  return {
    shared: { ...(baseConfig.shared ?? {}), ...(localConfig.shared ?? {}) },
    bays: mergedBays
  };
}

// 아파트 타석(monitorOnly)은 "관찰만" 한다. 화면을 숨기는 것만으로는 부족하다.
// 세션 만료가 들어오면 beginEndNotice() 가 서버 세션 종료 API 를 부르고,
// 서버는 거기서 release_bay(장비 OFF) 명령까지 큐에 넣는다. 송도에는 제어기도
// 장비 매핑도 없어 그 명령은 실행되지 않고 쌓이기만 한다. 세션 종료는
// 관리자 화면이 하는 일이지 Agent 가 할 일이 아니다.
//
// 세 가지를 한 곳에서 정해야 하나만 빠뜨리는 일이 없다.
function resolveBayPolicy(merged = {}) {
  const monitorOnly = merged.monitorOnly === true;

  return {
    monitorOnly,
    // 남은시간 경고창·종료 잠금화면을 띄울지
    showsCustomerUi: !monitorOnly,
    // 만료 세션을 Agent 가 서버에서 종료해도 되는지 (장비 OFF 명령이 따라온다)
    mayEndServerSession: !monitorOnly,
    // 이용 종료 후 Agent 가 스스로 PC 를 끌 때까지의 분. 0 이면 끄지 않는다
    autoShutdownAfterEndMinutes: monitorOnly ? 0 : Math.max(0, Number(merged.autoShutdownAfterEndMinutes ?? 5))
  };
}

module.exports = { mergeBaysConfig, resolveBayPolicy };
