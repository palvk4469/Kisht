// Service worker: makes the app open with no signal (D7, D22).
//
// App shell: precached on install, network-first for pages (with a short
// timeout, because weak signal hangs rather than fails), cache-first for hashed
// static files. API responses are never cached here: borrower data lives only
// in IndexedDB, where sign-out and expiry can reach it. The build id in this
// script's URL names the cache, so each deploy replaces the old shell.

const VERSION = new URL(self.location.href).searchParams.get("v") ?? "dev";
const CACHE = `kisht-shell-${VERSION}`;
const SHELL = ["/", "/login", "/today", "/today/loan", "/today/promises", "/manager/dashboard"];
const NETWORK_TIMEOUT_MS = 3000;

const staticUrls = (text) => text.match(/\/_next\/static\/[^"'\s\\)]+/g) ?? [];

async function precache() {
  const cache = await caches.open(CACHE);
  const assets = new Set();
  for (const path of SHELL) {
    const res = await fetch(path, { cache: "reload" });
    if (!res.ok) continue;
    await cache.put(path, res.clone());
    for (const url of staticUrls(await res.text())) assets.add(url);
  }
  // Stylesheets name the font files, which pages only load through them.
  for (const url of [...assets]) {
    if (!url.includes(".css")) continue;
    const res = await fetch(url);
    if (res.ok) for (const font of staticUrls(await res.text())) assets.add(font);
  }
  await Promise.allSettled([...assets].map((url) => cache.add(url)));
  await Promise.allSettled(
    ["/manifest.webmanifest", "/icons/icon-192.png"].map((u) => cache.add(u)),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith("kisht-shell-") && n !== CACHE)
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) (await caches.open(CACHE)).put(request, res.clone());
  return res;
}

async function page(request, path) {
  const cache = await caches.open(CACHE);
  const network = fetch(request).then((res) => {
    if (res.ok && SHELL.includes(path)) cache.put(path, res.clone());
    return res;
  });
  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS, null));
  try {
    const res = await Promise.race([network, timeout]);
    if (res) return res;
  } catch {
    // Offline: fall through to the cached page.
  }
  const cached = (await cache.match(path)) ?? (await cache.match("/"));
  return cached ?? network;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    event.respondWith(page(request, url.pathname));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request));
  }
  // Router data (RSC) falls through: if it fails offline, Next does a full
  // navigation, which the page handler above answers from the cache.
});
