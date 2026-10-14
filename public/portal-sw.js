// The portal's own service worker (2026-10-14, water-tank push alerts,
// user-asked). Deliberately minimal — scoped to /portal, holding only what
// a push notification needs. There is no outbox here: the portal has no
// offline-work queue, so this carries none of field-sw.js's offline-page
// caching, IndexedDB sync or retention machinery.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let msg = {};
  try {
    msg = event.data ? event.data.json() : {};
  } catch {
    msg = { title: "FirsThing", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(msg.title || "FirsThing", {
      body: msg.body || "",
      tag: msg.tag || undefined,
      icon: "/field-icon/192",
      badge: "/field-icon/192",
      data: { url: typeof msg.url === "string" && msg.url.startsWith("/") ? msg.url : "/portal" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/portal";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if (new URL(c.url).origin === self.location.origin && "focus" in c) {
          await c.focus();
          if ("navigate" in c) return c.navigate(url).catch(() => self.clients.openWindow(url));
          return;
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
