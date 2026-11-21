function createObserverTransport({ config, run, onError, now = Date.now, schedule = setTimeout, cancel = clearTimeout }) {
  const eligible = config.monitorOnly === true &&
    (config.storeId === "b2f7192b-9472-4006-a58d-ffec3afc90ce" || config.observerTransport === true);
  let observer = false;
  let negotiationAfter = 0;
  let nextAt = 0;
  let retryAt = 0;
  let failures = 0;
  let lastAttempt = -Infinity;
  let immediateAt = Infinity;
  let signature = null;
  let eventIds = new Set();
  let inFlight = null;
  let timer = null;
  let stopped = false;

  function validPolicy(data) {
    return data?.observerPolicy?.protocol === 1 && data.observerPolicy.pollIntervalSeconds === 60;
  }

  function arm() {
    if (timer !== null) cancel(timer);
    timer = null;
    if (stopped || inFlight) return;
    const due = observer ? (retryAt || Math.min(nextAt, immediateAt)) : retryAt || Infinity;
    if (Number.isFinite(due)) timer = schedule(() => { timer = null; void poll(); }, Math.max(0, due - now()));
  }

  function fallback() {
    observer = false;
    negotiationAfter = now() + 60_000;
    immediateAt = Infinity;
    // Fetch legacy commands promptly, without repeatedly negotiating a partially upgraded server.
    retryAt = now() || 1;
  }

  function observe(telemetry, events = []) {
    const nextSignature = JSON.stringify([telemetry?.gameRunning ?? null, telemetry?.usage?.state ?? null, telemetry?.usage?.usageId ?? null]);
    const nextIds = new Set(events.map((event) => event.eventId ?? (event.roundId ? `${event.roundId}:${event.revision}` : null)).filter(Boolean));
    const changed = signature !== nextSignature || [...nextIds].some((id) => !eventIds.has(id));
    signature = nextSignature;
    eventIds = nextIds;
    if (observer && changed) {
      immediateAt = Math.min(immediateAt, Math.max(now() + 500, lastAttempt + 2_000));
      arm();
    }
  }

  function poll() {
    if (stopped) return Promise.resolve();
    if (inFlight) return inFlight;
    const time = now();
    if (retryAt ? time < retryAt : observer && time < Math.min(nextAt, immediateAt)) return Promise.resolve();
    lastAttempt = time;
    immediateAt = Infinity;
    retryAt = 0;
    // Register the flight before the callback can schedule work.
    inFlight = Promise.resolve().then(run).then(() => {
      failures = 0;
      nextAt = now() + 60_000;
    }).catch((error) => {
      failures += 1;
      retryAt = now() + Math.min(30_000, 5_000 * 2 ** Math.min(failures - 1, 3));
      onError(error);
    }).finally(() => {
      inFlight = null;
      arm();
    });
    return inFlight;
  }

  return {
    poll,
    observe,
    isEligible: () => eligible,
    isObserver: () => observer,
    sessionHeaders: () => eligible && now() >= negotiationAfter ? { "x-vista-observer-protocol": "1" } : {},
    acceptSession(data) {
      observer = eligible && now() >= negotiationAfter && data?.session === null && validPolicy(data);
    },
    acceptHeartbeat(data) {
      if (observer && !validPolicy(data)) fallback();
    },
    stop() { stopped = true; if (timer !== null) cancel(timer); }
  };
}

module.exports = { createObserverTransport };
