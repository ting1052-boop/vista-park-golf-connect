const CACHE_NAME = "vista-connect-v4";
const CORE_ASSETS = ["/member/app", "/icons/icon-192.png", "/manifest.webmanifest", "/admin-manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .catch(() => undefined)
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/_next/webpack-hmr")) return;

  // Keep authenticated pages out of shared caches and member-page fallbacks.
  if (url.pathname === "/" || url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
    event.respondWith(fetch(request).catch(() => request.mode === "navigate"
      ? new Response('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VISTA 매장관리</title><body><h1>연결을 확인해주세요</h1><p>관리자 화면을 불러올 수 없습니다. 인터넷 연결을 확인하고 새로고침해주세요.</p></body></html>', { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } })
      : Response.error()));
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache).catch(() => undefined);
        });
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;

        if (request.mode === "navigate") {
          return caches.match("/member/app");
        }

        return Response.error();
      })
  );
});
