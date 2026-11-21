/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { createObserverTransport } = require("./observer-transport");

const songdo = { monitorOnly: true, storeId: "b2f7192b-9472-4006-a58d-ffec3afc90ce" };
const roundCountingObserver = { monitorOnly: true, storeId: "another-store", observerTransport: true };
const observerPolicy = { protocol: 1, pollIntervalSeconds: 60 };
const confirmation = { session: null, observerPolicy };
const healthy = { ok: true, observerPolicy };

function clock() {
  let time = 100_000;
  let id = 0;
  const timers = new Map();
  return {
    now: () => time,
    schedule(fn, delay) { timers.set(++id, { fn, at: time + delay }); return id; },
    cancel(key) { timers.delete(key); },
    async advance(ms) {
      time += ms;
      for (let round = 0; round < 30; round += 1) {
        const due = [...timers].filter(([, timer]) => timer.at <= time);
        if (!due.length) break;
        for (const [key, timer] of due) { timers.delete(key); timer.fn(); }
        for (let step = 0; step < 30; step += 1) await Promise.resolve();
        assert.ok(round < 29, "timer storm");
      }
    },
    timerCount: () => timers.size
  };
}

function fixture(options = {}) {
  const time = clock();
  let calls = 0;
  const errors = [];
  const transport = createObserverTransport({
    config: options.config ?? songdo,
    ...time,
    onError: (error) => errors.push(error),
    run: async () => { calls += 1; await options.run?.(transport); }
  });
  return { transport, time, errors, calls: () => calls };
}

test("strict Songdo boolean opt-in and exact policy/session negotiation", async () => {
  for (const config of [{}, { ...songdo, monitorOnly: false }, { ...songdo, monitorOnly: "true" }, { ...songdo, storeId: "other" }]) {
    const f = fixture({ config });
    assert.deepEqual(f.transport.sessionHeaders(), {});
    f.transport.acceptSession(confirmation);
    assert.equal(f.transport.isObserver(), false);
    await f.transport.poll();
    await f.transport.poll();
    assert.equal(f.calls(), 2);
    assert.equal(f.time.timerCount(), 0);
  }
  const f = fixture();
  assert.deepEqual(f.transport.sessionHeaders(), { "x-vista-observer-protocol": "1" });
  for (const data of [{}, { observerPolicy }, { ...confirmation, session: { accessSessionId: "commercial" } }, { session: null, observerPolicy: { protocol: "1", pollIntervalSeconds: 60 } }, { session: null, observerPolicy: { protocol: 1, pollIntervalSeconds: 600 } }]) {
    f.transport.acceptSession(data);
    assert.equal(f.transport.isObserver(), false);
  }
  f.transport.acceptSession(confirmation);
  assert.equal(f.transport.isObserver(), true);

  const configured = fixture({ config: roundCountingObserver });
  assert.deepEqual(configured.transport.sessionHeaders(), { "x-vista-observer-protocol": "1" });
  configured.transport.acceptSession(confirmation);
  assert.equal(configured.transport.isObserver(), true);
});

test("failed immediate send retries at backoff instead of waiting for the regular interval", async () => {
  let fail = false;
  const f = fixture({ run: async () => {
    if (fail) throw new Error("offline");
  } });
  f.transport.acceptSession(confirmation);
  await f.transport.poll();
  fail = true;
  f.transport.observe({ gameRunning: true });
  await f.time.advance(2_000);
  assert.equal(f.calls(), 2);
  await f.time.advance(4_999);
  assert.equal(f.calls(), 2);
  await f.time.advance(1);
  assert.equal(f.calls(), 3, "retry must follow the 5 second backoff");
});

test("negotiation sends first heartbeat in same flight; subsequent sends use independent 60s timer", async () => {
  const sent = [];
  const f = fixture({ run: async (transport) => {
    if (!transport.isObserver()) { sent.push("GET"); transport.acceptSession(confirmation); }
    sent.push(transport.isObserver() ? "POST:1" : "POST:legacy");
    transport.acceptHeartbeat(healthy);
  } });
  await f.transport.poll();
  assert.deepEqual(sent, ["GET", "POST:1"]);
  await f.time.advance(59_999);
  await f.transport.poll();
  assert.equal(f.calls(), 1);
  await f.time.advance(1);
  assert.deepEqual(sent, ["GET", "POST:1", "POST:1"]);
  f.transport.stop();
  await f.time.advance(60_000);
  assert.equal(f.calls(), 2);
});

test("meaningful detector changes debounce; timestamps and old unACKed IDs never storm", async () => {
  const f = fixture();
  const idle = { gameRunning: true, usage: { state: "awaiting_input", usageId: null } };
  f.transport.observe(idle, [{ eventId: "old" }]);
  f.transport.acceptSession(confirmation);
  await f.transport.poll();
  await f.time.advance(3_000);
  for (let index = 0; index < 100; index += 1) {
    f.transport.observe({ ...idle, observedAt: index, sampleSequence: index, usage: { ...idle.usage, lastInputAt: index } }, [{ eventId: "old" }]);
  }
  await f.time.advance(10_000);
  assert.equal(f.calls(), 1);
  const active = { gameRunning: true, usage: { state: "active", usageId: "usage-1" } };
  f.transport.observe(active, [{ eventId: "old" }, { eventId: "started" }]);
  f.transport.observe(active, [{ eventId: "old" }, { eventId: "started" }]);
  await f.time.advance(499);
  assert.equal(f.calls(), 1);
  await f.time.advance(1);
  assert.equal(f.calls(), 2);
  f.transport.observe(idle, [{ eventId: "ended" }]);
  await f.time.advance(1_999);
  assert.equal(f.calls(), 2);
  await f.time.advance(1);
  assert.equal(f.calls(), 3);
  f.transport.observe({ ...idle, gameRunning: false }, [{ eventId: "ended" }]);
  await f.time.advance(2_000);
  assert.equal(f.calls(), 4);
  f.transport.observe({ ...idle, gameRunning: false }, []);
  await f.time.advance(3_000);
  assert.equal(f.calls(), 4, "ACK removal does not send");
  f.transport.observe({ ...idle, gameRunning: false }, [{ eventId: "new-round" }]);
  await f.time.advance(500);
  assert.equal(f.calls(), 5, "new outbox ID sends even without state change");
});

test("missing policy promptly falls back, with renegotiation cooldown and no timer storm", async () => {
  const sent = [];
  const f = fixture({ run: async (transport) => {
    if (!transport.isObserver()) {
      sent.push(transport.sessionHeaders()["x-vista-observer-protocol"] ? "GET:1" : "GET:legacy");
      transport.acceptSession(confirmation);
    }
    sent.push(transport.isObserver() ? "POST:1" : "POST:legacy");
    transport.acceptHeartbeat({ ok: true });
  } });
  await f.transport.poll();
  assert.equal(f.transport.isObserver(), false);
  await f.time.advance(0);
  assert.deepEqual(sent, ["GET:1", "POST:1", "GET:legacy", "POST:legacy"]);
  assert.equal(f.time.timerCount(), 0);
  await f.time.advance(15_000);
  await f.transport.poll();
  assert.deepEqual(sent.slice(-2), ["GET:legacy", "POST:legacy"]);
  await f.time.advance(45_000);
  assert.equal(f.transport.sessionHeaders()["x-vista-observer-protocol"], "1");
});

test("single flight retains detector changes arriving during slow transport", async () => {
  let release;
  const f = fixture({ run: () => new Promise((resolve) => { release = resolve; }) });
  f.transport.observe({ gameRunning: false });
  f.transport.acceptSession(confirmation);
  const first = f.transport.poll();
  assert.equal(f.transport.poll(), first);
  await Promise.resolve();
  await f.time.advance(3_000);
  f.transport.observe({ gameRunning: true });
  assert.equal(f.transport.poll(), first);
  assert.equal(f.calls(), 1);
  release();
  await first;
  await f.time.advance(500);
  assert.equal(f.calls(), 2);
  release();
  await f.transport.poll();
});

test("failures retain valid policy and have bounded retry backoff unaffected by detector storms", async () => {
  const f = fixture({ run: async (transport) => {
    transport.acceptHeartbeat({ ok: false, observerPolicy });
    throw new Error("command claim failed");
  } });
  f.transport.acceptSession(confirmation);
  await f.transport.poll();
  assert.equal(f.transport.isObserver(), true);
  for (const delay of [5_000, 10_000, 20_000, 30_000, 30_000]) {
    const count = f.calls();
    f.transport.observe({ gameRunning: count % 2 === 0 });
    await f.time.advance(delay - 1);
    await f.transport.poll();
    assert.equal(f.calls(), count);
    await f.time.advance(1);
    assert.equal(f.calls(), count + 1);
  }
  assert.equal(f.errors.length, 6);
});

function mainHarness(responses, input = songdo) {
  const sourcePath = path.join(__dirname, "electron-main.js");
  const localRequire = createRequire(sourcePath);
  const requests = [];
  const acknowledgements = [];
  const time = clock();
  const context = {
    __dirname,
    process: { env: {} },
    console,
    Buffer,
    AbortSignal,
    setTimeout: time.schedule,
    clearTimeout: time.cancel,
    setInterval: time.schedule,
    clearInterval: time.cancel,
    require(name) {
      if (name === "electron") return { app: { requestSingleInstanceLock: () => true, on() {}, whenReady: () => ({ then() {} }) }, ipcMain: { handle() {} } };
      if (name === "node:child_process") return { execFile() { throw new Error("device commands forbidden"); } };
      return localRequire(name);
    },
    async fetch(url, options) {
      requests.push({ url, ...options, payload: options.body ? JSON.parse(options.body) : null });
      const response = responses.shift();
      assert.ok(response, "unexpected request");
      return { ok: response.status < 400, status: response.status, json: async () => response.body };
    }
  };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8") + `
    globalThis.initialize = (input, time, acknowledgements) => {
      config = { ...input, sessionSource: "server", apiBaseUrl: "https://no-network.invalid", agentToken: "test-only", agentId: "test", gameMonitoringEnabled: true, showsCustomerUi: false };
      latestGameTelemetry = { gameRunning: true, usage: { state: "active", usageId: "usage" } };
      log = () => {};
      roundEventOutbox = { list: () => [{eventId: "round"}], applyServerResult: (...args) => acknowledgements.push(["round", ...args]) };
      usageWindowMonitor = { listEvents: () => [{eventId: "usage"}], applyServerResult: (...args) => acknowledgements.push(["usage", ...args]) };
      agentTransport = createObserverTransport({config, ...time, run: syncAgentTransport, onError: () => {}});
      return {tick, observer: () => agentTransport.isObserver()};
    };`, context);
  return { api: context.initialize(input, time, acknowledgements), requests, acknowledgements, time };
}

test("actual main integration: observer session fetch failure backs off", async () => {
  const f = mainHarness([
    { status: 503, body: {} },
    { status: 200, body: { ...confirmation, commands: [] } },
    { status: 200, body: { observerPolicy, commands: [] } }
  ], roundCountingObserver);
  await f.api.tick();
  assert.equal(f.requests.length, 1);
  await f.time.advance(4_999);
  assert.equal(f.requests.length, 1);
  await f.time.advance(1);
  assert.equal(f.requests.length, 3);
  assert.equal(f.api.observer(), true);
});

test("actual main integration: numeric protocol, 500 ACK preservation, heartbeat commands, no network", async () => {
  const f = mainHarness([
    { status: 200, body: { ...confirmation, commands: [] } },
    { status: 500, body: { observerPolicy, roundEventAckIds: ["round"], usageEventAckIds: ["usage"], commands: [] } },
    { status: 200, body: { observerPolicy, commands: [{ id: "shutdown-test", type: "shutdown_pc" }] } },
    { status: 200, body: { ok: true } }
  ]);
  await f.api.tick();
  assert.equal(f.requests.length, 2, "handshake immediately followed by heartbeat");
  assert.equal(f.requests[0].headers["x-vista-observer-protocol"], "1");
  assert.equal(f.requests[1].payload.observerProtocol, 1);
  assert.equal(f.api.observer(), true);
  assert.deepEqual(Array.from(f.acknowledgements[0][1]), ["round"]);
  assert.deepEqual(Array.from(f.acknowledgements[1][1]), ["usage"]);
  assert.ok(f.requests.every((request) => request.signal));
  await f.time.advance(5_000);
  await f.api.tick();
  assert.equal(f.requests.length, 4);
  assert.ok(f.requests[2].url.endsWith("/heartbeat"));
  assert.ok(f.requests[3].url.endsWith("/command-result"));
  assert.equal(f.requests[3].payload.commandId, "shutdown-test");
});

test("actual main integration: commercial sessions keep GET+POST and legacy commands", async () => {
  const session = { accessSessionId: "commercial", endsAt: new Date(Date.now() + 3_600_000).toISOString(), status: "active" };
  const f = mainHarness([
    { status: 200, body: { session, observerPolicy, commands: [{ id: "legacy-command", type: "shutdown_pc" }] } },
    { status: 200, body: { ok: true } },
    { status: 200, body: { observerPolicy } },
    { status: 200, body: { session } },
    { status: 200, body: {} }
  ], { ...songdo, monitorOnly: false });
  await f.api.tick();
  await f.api.tick();
  assert.equal(f.requests.length, 5);
  assert.equal(f.requests[0].headers["x-vista-observer-protocol"], undefined);
  assert.ok(f.requests[1].url.endsWith("/command-result"));
  for (const request of f.requests.filter((item) => item.url.endsWith("/heartbeat"))) {
    assert.equal(request.payload.observerProtocol, undefined);
    assert.equal(request.payload.accessSessionId, "commercial");
    assert.equal(request.payload.status, "playing");
  }
  assert.equal(f.api.observer(), false);
});

test("actual main integration: policy loss immediately recovers legacy shutdown delivery", async () => {
  const f = mainHarness([
    { status: 200, body: { ...confirmation, commands: [] } },
    { status: 200, body: {} },
    { status: 200, body: { session: null, commands: [{ id: "fallback-command", type: "shutdown_pc" }] } },
    { status: 200, body: { ok: true } },
    { status: 200, body: {} }
  ]);
  await f.api.tick();
  assert.equal(f.api.observer(), false);
  await f.time.advance(0);
  assert.equal(f.requests.length, 5);
  assert.equal(f.requests[2].headers["x-vista-observer-protocol"], undefined);
  assert.ok(f.requests[2].url.includes("/session?"));
  assert.equal(f.requests[3].payload.commandId, "fallback-command");
  assert.equal(f.requests[4].payload.observerProtocol, undefined);
  assert.equal(f.time.timerCount(), 1, "only mocked Windows shutdown timer remains");
});
