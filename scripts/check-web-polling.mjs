import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8").replaceAll("\r\n", "\n");
const compile = (code) => ts.transpileModule(code, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

function clock() {
  let now = 0;
  let id = 0;
  const timers = new Map();
  const events = new Set();
  const document = {
    visibilityState: "visible",
    addEventListener: (_, fn) => events.add(fn),
    removeEventListener: (_, fn) => events.delete(fn)
  };
  const flush = async () => { for (let n = 0; n < 12; n++) await Promise.resolve(); };
  return {
    document,
    events,
    timers,
    setTimeout(fn, ms) { timers.set(++id, { fn, at: now + ms }); return id; },
    clearTimeout(key) { timers.delete(key); },
    async tick(ms) {
      const end = now + ms;
      while (true) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        now = next[1].at;
        timers.delete(next[0]);
        next[1].fn();
        await flush();
      }
      now = end;
      await flush();
    },
    async visible(value) {
      document.visibilityState = value ? "visible" : "hidden";
      events.forEach((fn) => fn());
      await flush();
    },
    flush
  };
}

function fixture(initiallyVisible = true) {
  const time = clock();
  time.document.visibilityState = initiallyVisible ? "visible" : "hidden";
  const exports = {};
  vm.runInNewContext(compile(source("src/lib/visible-poller.ts")), {
    exports, AbortController, Error, document: time.document,
    setTimeout: time.setTimeout, clearTimeout: time.clearTimeout
  });
  const requests = [];
  const values = [];
  const errors = [];
  const delays = [];
  const loading = [];
  const poller = exports.createVisiblePoller({
    read: (signal) => new Promise((resolve, reject) => requests.push({ signal, resolve, reject })),
    onData: (data) => { values.push(data); return data.delay; },
    onError: (error) => errors.push(error),
    onDelay: (delay) => delays.push(delay),
    onLoading: (value) => loading.push(value)
  });
  return { time, poller, requests, values, errors, delays, loading, ...exports };
}

{
  const f = fixture();
  const joined = f.poller.refresh(false);
  await f.time.tick(9_000);
  assert.equal(f.requests.length, 1, "slow requests cannot overlap");
  f.requests[0].resolve({ delay: 5_000 });
  await joined;
  await f.time.tick(4_999);
  assert.equal(f.requests.length, 1, "next delay starts after response completion");
  await f.time.tick(1);
  assert.equal(f.requests.length, 2);
  f.requests[1].reject(new Error("offline"));
  await f.time.flush();
  assert.equal(f.delays.at(-1), 30_000, "stale fast-pending data cannot defeat failure backoff");
  for (const delay of [60_000, 120_000, 120_000]) {
    await f.time.tick(f.delays.at(-1));
    f.requests.at(-1).reject(new Error("still offline"));
    await f.time.flush();
    assert.equal(f.delays.at(-1), delay);
  }
  const beforeManual = f.requests.length;
  const recovery = f.poller.refresh();
  assert.equal(f.requests.length, beforeManual + 1, "manual refresh bypasses backoff");
  f.requests.at(-1).resolve({ delay: 15_000 });
  await recovery;
  assert.equal(f.delays.at(-1), 15_000);
  assert.equal(f.loading.at(-1), false);
  await f.time.tick(15_000);
  f.requests.at(-1).reject(new Error("new failure"));
  await f.time.flush();
  assert.equal(f.delays.at(-1), 30_000, "success resets failure count");
  f.poller.dispose();
}

{
  const f = fixture();
  f.requests[0].resolve({ delay: 60_000 });
  await f.time.flush();
  await f.time.tick(60_000);
  f.requests[1].reject(new Error("offline"));
  await f.time.flush();
  assert.equal(f.delays.at(-1), 120_000, "failure cannot accelerate a normally slow poll");
  f.poller.dispose();
}

{
  const f = fixture();
  await f.time.tick(10_000);
  assert.equal(f.requests[0].signal.aborted, true);
  assert.match(f.errors[0].message, /timed out/);
  assert.equal(f.loading.at(-1), false);
  const recovery = f.poller.refresh();
  f.requests[0].resolve({ delay: 5_000, stale: true });
  await f.time.flush();
  assert.equal(f.values.length, 0, "late timeout response is ignored");
  f.requests[1].resolve({ delay: 15_000 });
  await recovery;
  assert.equal(f.values.length, 1);
  f.poller.dispose();
  assert.equal(f.time.timers.size, 0);
  assert.equal(f.time.events.size, 0);
}

{
  const f = fixture();
  const first = f.poller.refresh();
  const second = f.poller.refresh();
  assert.equal(first, second, "manual refreshes share one trailing request");
  assert.equal(f.requests.length, 1);
  f.requests[0].resolve({ delay: 15_000 });
  await f.time.flush();
  assert.equal(f.requests.length, 2, "manual/action refresh waits for a fresh response after an older read");
  f.requests[1].resolve({ delay: 5_000 });
  await first;
  assert.equal(f.requests.length, 2);
  f.poller.dispose();
}

{
  const oldStore = fixture();
  oldStore.poller.dispose();
  assert.equal(oldStore.requests[0].signal.aborted, true);
  oldStore.requests[0].resolve({ delay: 5_000 });
  await oldStore.time.flush();
  assert.equal(oldStore.values.length, 0, "unmount/store switch discards old responses");
  assert.equal(oldStore.errors.length, 0);
  assert.equal(oldStore.time.timers.size, 0);
  const nextStore = fixture(false);
  assert.equal(nextStore.requests.length, 0, "hidden mount does not fetch");
  await nextStore.time.visible(true);
  nextStore.requests[0].resolve({ delay: 5_000 });
  await nextStore.time.flush();
  await nextStore.time.visible(false);
  await nextStore.time.tick(60_000);
  assert.equal(nextStore.requests.length, 1);
  await nextStore.time.visible(true);
  assert.equal(nextStore.requests.length, 2, "visibility restoration refreshes immediately");
  nextStore.poller.dispose();
  await nextStore.time.flush();
}

{
  const { automationHasFreshPending, poller } = fixture(false);
  const now = Date.now();
  const status = { controllerStalled: false, pendingCommandCount: 1, stalePendingCount: 0,
    oldestPendingAt: new Date(now - 1_000).toISOString(), bays: [] };
  assert.equal(automationHasFreshPending(status, now), true);
  assert.equal(automationHasFreshPending(status, now + 30_000), false);
  assert.equal(automationHasFreshPending({ ...status, controllerStalled: true }, now), false);
  assert.equal(automationHasFreshPending({ ...status, stalePendingCount: 1 }, now), false);
  const staleBay = { powerPending: true, powerLastRunAt: new Date(now - 60_000).toISOString(), pcConnectionState: "offline" };
  assert.equal(automationHasFreshPending({ ...status, pendingCommandCount: 0, bays: [staleBay] }, now), false);
  poller.dispose();
}

// Execute the actual dashboard subscription and visibility effects, not a duplicate implementation.
{
  const dashboard = source("src/app/admin/dashboard/dashboard-client.tsx");
  const start = dashboard.indexOf("  useEffect(() => {\n    let active = true;");
  assert.ok(start > 0);
  const end = dashboard.indexOf("  useEffect(() => {\n    if (!toast)", start);
  assert.ok(end > start);
  const time = clock();
  const callbacks = [];
  const cleanups = [];
  let refreshes = 0;
  let unsubscribed = 0;
  vm.runInNewContext(compile(dashboard.slice(start, end)), {
    useEffect: (fn) => cleanups.push(fn()),
    subscribeToBays: (fn) => { callbacks.push(fn); return () => unsubscribed++; },
    currentStoreId: "store-a", router: { refresh: () => refreshes++ }, setDataError() {},
    getStoreObservationPolicy: () => ({ refreshIntervalMs: 60_000 }), document: time.document,
    window: { setInterval: time.setTimeout, clearInterval: time.clearTimeout }
  });
  await time.visible(false);
  callbacks[0](); callbacks[0](); callbacks[0]();
  assert.equal(refreshes, 0, "hidden realtime burst cannot refresh");
  await time.visible(true);
  assert.equal(refreshes, 1, "one refresh catches up after hidden events");
  callbacks[0]();
  assert.equal(refreshes, 2, "visible realtime still refreshes");
  cleanups.forEach((fn) => fn());
  callbacks[0]();
  assert.equal(refreshes, 2, "old-store callback is inactive after cleanup");
  assert.equal(unsubscribed, 1);
  assert.equal(time.events.size, 0);
}

const page = source("src/app/admin/automation/page.tsx");
assert.match(page, /key=\{context\.storeId\}/, "store switch must remount and abort the old poller");
assert.match(page, /storeId=\{context\.storeId\}/);

{
  const client = source("src/app/admin/automation/automation-client.tsx");
  const start = client.indexOf("  useEffect(() => {");
  const end = client.indexOf("  async function run(", start);
  let options;
  let now = 1_000_000;
  const f = fixture(false);
  const poller = { current: null };
  const scheduleLoaded = { current: false };
  let scheduleWrites = 0;
  let cleanup;
  vm.runInNewContext(compile(client.slice(start, end)), {
    useEffect: (fn) => { cleanup = fn(); },
    createVisiblePoller: (value) => { options = value; return { dispose() {} }; },
    automationHasFreshPending: f.automationHasFreshPending,
    poller, scheduleLoaded, storeId: "store-a", Date: { now: () => now },
    setError() {}, setStatus() {}, setAutomationMode() {},
    setSchedules() { scheduleWrites++; }, setLoading() {}, setRefreshIntervalMs() {},
    DEFAULT_OPEN_TIME: "06:00", DEFAULT_CLOSE_TIME: "23:00"
  });
  const pending = {
    controllerStalled: false, pendingCommandCount: 0, stalePendingCount: 0, oldestPendingAt: null,
    refreshIntervalMs: 60_000,
    bays: [{ powerPending: false, powerLastRunAt: null, pcConnectionState: "shutdown_pending" }],
    automation: { mode: "store", schedules: [] }
  };
  assert.equal(options.onData(pending), 5_000);
  now += 31_000;
  assert.equal(options.onData(pending), 60_000, "unchanged shutdown_pending cannot sustain fast polling");
  assert.equal(scheduleWrites, 1, "polls do not overwrite unsaved schedule edits");
  assert.equal(options.onData({ ...pending, bays: [] }), 60_000);
  assert.equal(options.onData(pending), 5_000, "a new pending transition can poll fast again");
  cleanup();
  assert.equal(poller.current, null);
  f.poller.dispose();
}
console.log("Web polling checks passed: single-flight, timeout, backoff, recovery, visibility, store cleanup.");
