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

module.exports = { mergeBaysConfig };
