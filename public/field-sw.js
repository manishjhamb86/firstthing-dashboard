/*
 * FirsThing Field — service worker (docs/engineering/19-field-app.md §4.1).
 *
 * Scoped to /field only: it never touches the back office or the portal.
 * Hand-written rather than generated (Serwist, which Next's PWA guide points
 * to, needs webpack; this app builds with Turbopack).
 *
 * What it does, and only this:
 *  - hashed build assets (/_next/static) — cache first; their names change
 *    whenever their content does, so a cached copy is never stale;
 *  - /field pages — NETWORK first. With signal the page is always the current
 *    one; the copy kept is only for when there is none. A page seen once on
 *    this phone opens again in a basement.
 *  - no signal and no kept copy — a plain offline page, never a browser error.
 *
 * Cached pages carry this person's work, so signing out clears them (the
 * "clear" message below, sent by the sign-out control before it signs out).
 * Bump VERSION when this file's behaviour changes.
 */

const VERSION = "v1";
const STATIC_CACHE = `ft-field-static-${VERSION}`;
const PAGE_CACHE = `ft-field-pages-${VERSION}`;
const OFFLINE_URL = "/field-offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/field.webmanifest", "/field-icon/192"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("ft-field-") && k !== STATIC_CACHE && k !== PAGE_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "clear") {
    event.waitUntil(
      caches.delete(PAGE_CACHE).then(() => {
        if (event.ports && event.ports[0]) event.ports[0].postMessage({ cleared: true });
      }),
    );
  }
});

function isFieldPath(pathname) {
  return pathname === "/field" || pathname.startsWith("/field/");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Hashed build output: cache first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // A page of the field app: network first, the kept copy when offline.
  if (req.mode === "navigate" && isFieldPath(url.pathname)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Keep only a real page for this address — never a redirect to
          // sign-in, and never an error page standing in for the real one.
          if (res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(PAGE_CACHE).then((c) => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(() =>
          caches
            .match(url.pathname, { cacheName: PAGE_CACHE })
            .then((hit) => hit || caches.match(OFFLINE_URL)),
        ),
    );
  }
  // Everything else (RSC payloads, server actions, API calls) goes to the
  // network untouched. When a client-side navigation cannot reach the server,
  // Next falls back to a full page load, which the branch above answers.
});
