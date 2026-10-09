import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const manifest = JSON.parse(fs.readFileSync(new URL("../public/admin-manifest.webmanifest", import.meta.url), "utf8"));
assert.equal(manifest.start_url, "/admin/dashboard");
assert.equal(manifest.scope, "/admin/");
assert.notEqual(manifest.id, "/member/app");
assert.ok(manifest.shortcuts.every((item) => item.url.startsWith("/admin/")));
const handlers = {};
const cacheCalls = [];
let offline = false;
vm.runInNewContext(fs.readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), {
  self: { location: { origin: "https://vista.example" }, addEventListener: (type, handler) => { handlers[type] = handler; }, skipWaiting() {} },
  URL, Response,
  fetch: async () => {
    if (offline) throw new Error("offline");
    return new Response("network response");
  },
  caches: {
    match: async (key) => { cacheCalls.push(["match", key]); return new Response("cached member page"); },
    open: async () => ({
      addAll: async (keys) => { cacheCalls.push(["precache", [...keys]]); },
      put: async () => { cacheCalls.push(["put"]); }
    })
  }
});
handlers.install({ waitUntil: (promise) => promise });
await Promise.resolve();
assert.ok(cacheCalls.find(([type]) => type === "precache")[1].every((path) => path !== "/" && !path.startsWith("/admin/")));
async function navigate(path, mode = "navigate") {
  let result;
  handlers.fetch({ request: { method: "GET", url: "https://vista.example" + path, mode }, respondWith: (promise) => { result = promise; } });
  return result;
}
cacheCalls.length = 0;
assert.equal(await (await navigate("/admin/dashboard")).text(), "network response");
assert.equal(cacheCalls.length, 0);
offline = true;
for (const path of ["/", "/admin", "/admin/dashboard", "/admin/login", "/admin/automation"]) {
  const response = await navigate(path);
  assert.equal(response.status, 503);
  assert.match(await response.text(), /관리자/);
}
assert.equal(cacheCalls.length, 0);
assert.equal((await navigate("/admin/dashboard", "cors")).type, "error");
assert.equal(await (await navigate("/member/app")).text(), "cached member page");
assert.equal(await navigate("/api/admin/automation"), undefined);
console.log("Admin PWA checks passed: separate entry/scope, no cached admin data or reservation fallback, member/API behavior preserved.");
