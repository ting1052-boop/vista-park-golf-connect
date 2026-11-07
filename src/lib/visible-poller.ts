type PollOptions<T> = {
  read: (signal: AbortSignal) => Promise<T>;
  onData: (data: T) => number;
  onError: (error: unknown) => void;
  onLoading: (loading: boolean) => void;
  onDelay: (delay: number) => void;
};

export function createVisiblePoller<T>(options: PollOptions<T>) {
  let disposed = false;
  let delay = 15_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let inFlight: Promise<void> | undefined;
  let queuedRefresh: Promise<void> | undefined;

  function schedule() {
    clearTimeout(timer);
    if (!disposed && document.visibilityState === "visible") {
      timer = setTimeout(() => void refresh(false), delay);
    }
  }

  function refresh(showLoading = true): Promise<void> {
    if (disposed || (!showLoading && document.visibilityState !== "visible")) return Promise.resolve();
    if (inFlight) {
      if (!showLoading) return inFlight;
      options.onLoading(true);
      queuedRefresh ??= inFlight.then(() => {
        queuedRefresh = undefined;
        return refresh(true);
      });
      return queuedRefresh;
    }
    clearTimeout(timer);
    controller = new AbortController();
    const signal = controller.signal;
    if (showLoading) options.onLoading(true);
    inFlight = (async () => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        // Race the entire read, including JSON decoding, even if a transport ignores abort.
        const expired = new Promise<never>((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("Status request cancelled")), { once: true });
          timeout = setTimeout(() => {
            reject(new Error("Status request timed out"));
            controller?.abort();
          }, 10_000);
        });
        const data = await Promise.race([options.read(signal), expired]);
        if (disposed || signal.aborted) return;
        delay = options.onData(data);
      } catch (error) {
        if (disposed) return;
        delay = Math.min(120_000, Math.max(15_000, delay) * 2);
        options.onError(error);
      } finally {
        clearTimeout(timeout);
        inFlight = undefined;
        controller = undefined;
        if (!disposed) {
          options.onLoading(false);
          options.onDelay(delay);
          schedule();
        }
      }
    })();
    return inFlight;
  }

  function visibilityChanged() {
    if (document.visibilityState === "visible") void refresh(false);
    else clearTimeout(timer);
  }

  document.addEventListener("visibilitychange", visibilityChanged);
  if (document.visibilityState === "visible") void refresh();
  return {
    refresh,
    dispose() {
      disposed = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", visibilityChanged);
    }
  };
}

type PendingStatus = {
  refreshIntervalMs?: number;
  controllerStalled: boolean;
  pendingCommandCount: number;
  stalePendingCount: number;
  oldestPendingAt: string | null;
  bays: Array<{ powerPending: boolean; pcConnectionState: string; powerLastRunAt: string | null }>;
};

export function automationHasFreshPending(status: PendingStatus, now = Date.now()) {
  const recent = (at: string | null) => {
    const age = at ? now - Date.parse(at) : Infinity;
    return age >= 0 && age < 30_000;
  };
  return (!status.controllerStalled && status.pendingCommandCount > status.stalePendingCount && recent(status.oldestPendingAt)) ||
    status.bays.some((bay) => (bay.powerPending && recent(bay.powerLastRunAt)) || bay.pcConnectionState === "shutdown_pending");
}
