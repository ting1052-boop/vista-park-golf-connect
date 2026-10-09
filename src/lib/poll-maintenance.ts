const INTERVAL_MS = 30_000;
const runs = new Map<string, { completedAt: number; pending?: Promise<unknown> }>();

// shortcut: this is per-instance throttling, not a distributed lock; existing DB guards remain authoritative.
export async function runPollMaintenance<T>(key: string, work: () => Promise<T>): Promise<T | undefined> {
  let state = runs.get(key);
  if (!state) {
    state = { completedAt: Number.NEGATIVE_INFINITY };
    runs.set(key, state);
  }
  if (state.pending) {
    await state.pending;
    return undefined;
  }
  if (Date.now() - state.completedAt < INTERVAL_MS) return undefined;
  const pending = Promise.resolve().then(work);
  state.pending = pending;
  try {
    const result = await pending;
    state.completedAt = Date.now();
    return result;
  } finally {
    state.pending = undefined;
  }
}
