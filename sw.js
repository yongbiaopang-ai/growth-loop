/* Growth Loop · Service Worker
 * 只缓存应用外壳；打卡数据在 localStorage，不经过这里。
 * 改静态文件后把 VERSION 加一，否则手机还在用旧缓存。
 */
const VERSION = "v3";
const CACHE = "growth-loop-" + VERSION;
const ASSETS = [
  "./",
  "./index.html",
  "./design/tokens.css",
  "./design/themes.css",
  "./app.css",
  "./app.js",
  "./seed.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match("./index.html"));
    })
  );
});
