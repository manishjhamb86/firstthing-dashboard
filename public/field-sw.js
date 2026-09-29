/*
 * FirsThing Field — service worker (docs/engineering/19-field-app.md §4.1).
 *
 * Scoped to /field only: it never touches the back office or the portal.
 * Hand-written rather than generated (Serwist, which Next's PWA guide points
 * to, needs webpack; this app builds with Turbopack).
 *
 * Three jobs:
 *
 * 1. PAGES. Hashed build assets (/_next/static) cache first — their names
 *    change whenever their content does. /field pages NETWORK first: with
 *    signal the page is always current; the copy kept is only for none. A
 *    page never seen on this phone gets a plain offline page. "warm" fetches
 *    the app's core pages AND the scripts/styles they load, so the inspection
 *    form opens in a basement even if it was never opened before.
 *
 * 2. SENDING. The ONE place outbox items are sent from — the open app asks
 *    ("drain"), Background Sync asks ("sync", even with the app closed).
 *    Strictly in order: an inspection's photo never goes before the
 *    inspection. A reply is read the way src/lib/field-sync.ts classifyReply
 *    reads it; keep the two in step:
 *       2xx done · 401 sign in (no strike) · 400/403/409/422 refused (strike;
 *       3 strikes blocks the queue and it is named on screen) · else retry.
 *
 * 3. SIGN-OUT. "clear" empties the kept pages — they carry this person's work.
 *
 * The IndexedDB layout ("ft-field" v1: outbox / photos / drafts) is the one
 * in src/app/field/outbox-db.ts. Change both together.
 *
 * Bump VERSION when this file's caching behaviour changes.
 */

const VERSION = "v2";
const STATIC_CACHE = `ft-field-static-${VERSION}`;
const PAGE_CACHE = `ft-field-pages-${VERSION}`;
const OFFLINE_URL = "/field-offline.html";
const BLOCK_AFTER_REFUSALS = 3;

// ── install / activate ────────────────────────────────────────────────

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

// ── pages ─────────────────────────────────────────────────────────────

function isFieldPath(pathname) {
  return pathname === "/field" || pathname.startsWith("/field/");
}

async function keepPage(path, res) {
  // Keep only a real page for this address — never a redirect to sign-in,
  // never an error page standing in for the real one.
  if (!res.ok || res.redirected) return;
  const cache = await caches.open(PAGE_CACHE);
  await cache.put(path, res);
}

/** Cache a page and every hashed script and stylesheet its HTML loads. */
async function warmPage(path) {
  const res = await fetch(path, { credentials: "same-origin", cache: "no-store" });
  if (!res.ok || res.redirected) return false;
  const html = await res.clone().text();
  await keepPage(path, res);
  const assets = new Set();
  for (const m of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)) assets.add(m[1]);
  const cache = await caches.open(STATIC_CACHE);
  await Promise.all(
    [...assets].map(async (a) => {
      if (await cache.match(a)) return;
      try {
        const r = await fetch(a);
        if (r.ok) await cache.put(a, r);
      } catch {
        /* the next warm-up tries again */
      }
    }),
  );
  return true;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

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

  if (req.mode === "navigate" && isFieldPath(url.pathname)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          keepPage(url.pathname, res.clone());
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

// ── the outbox ────────────────────────────────────────────────────────

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("ft-field", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "seq", autoIncrement: true });
      if (!db.objectStoreNames.contains("photos")) db.createObjectStore("photos", { keyPath: "id" });
      if (!db.objectStoreNames.contains("drafts")) db.createObjectStore("drafts", { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function reqP(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function firstItem(db) {
  const rows = await reqP(db.transaction("outbox").objectStore("outbox").getAll());
  rows.sort((a, b) => a.seq - b.seq);
  return rows[0] || null;
}

async function putItem(db, item) {
  const tx = db.transaction("outbox", "readwrite");
  tx.objectStore("outbox").put(item);
  await new Promise((r, j) => { tx.oncomplete = r; tx.onerror = () => j(tx.error); });
}

async function removeItem(db, item) {
  const tx = db.transaction(["outbox", "photos"], "readwrite");
  tx.objectStore("outbox").delete(item.seq);
  if (item.photoId) tx.objectStore("photos").delete(item.photoId);
  await new Promise((r, j) => { tx.oncomplete = r; tx.onerror = () => j(tx.error); });
}

async function getPhoto(db, id) {
  return reqP(db.transaction("photos").objectStore("photos").get(id));
}

function outcomeOf(status) {
  if (status >= 200 && status < 300) return "done";
  if (status === 401) return "sign_in";
  if (status === 400 || status === 403 || status === 409 || status === 422) return "refused";
  return "retry";
}

async function postJson(path, body) {
  const res = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { outcome: outcomeOf(res.status), json };
}

/** Send one item. Returns { outcome, error }. A thrown fetch = no signal. */
async function send(db, item) {
  try {
    if (item.kind === "inspection.photo") {
      const photo = await getPhoto(db, item.photoId);
      if (!photo) return { outcome: "refused", error: "The photo is no longer on this phone." };
      const url = await postJson("/api/field/upload-url", {
        inspectionItemId: item.payload.inspectionItemId,
        fileName: photo.fileName,
        contentType: photo.contentType,
      });
      if (url.outcome !== "done") return { outcome: url.outcome, error: url.json?.error ?? null };
      const put = await fetch(url.json.uploadUrl, { method: "PUT", body: photo.blob, headers: { "Content-Type": photo.contentType } });
      if (!put.ok) return { outcome: "retry", error: "The photo upload did not finish." };
      const r = await postJson("/api/field/sync", {
        id: item.id,
        kind: "inspection.photo",
        payload: { inspectionItemId: item.payload.inspectionItemId, key: url.json.key },
      });
      return { outcome: r.outcome, error: r.json?.error ?? null };
    }
    const r = await postJson("/api/field/sync", { id: item.id, kind: item.kind, payload: item.payload });
    return { outcome: r.outcome, error: r.json?.error ?? null };
  } catch {
    return { outcome: "retry", error: "No signal." };
  }
}

async function tell(message) {
  const all = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
  for (const c of all) c.postMessage(message);
}

let draining = null;

/** Send everything that can be sent, in order, stopping at the first that cannot. */
function drain() {
  if (draining) return draining;
  draining = (async () => {
    const db = await openDb();
    let signIn = false;
    try {
      for (;;) {
        const item = await firstItem(db);
        if (!item || item.state === "blocked") break;
        const { outcome, error } = await send(db, item);
        if (outcome === "done") {
          await removeItem(db, item);
          await tell({ type: "outbox-changed" });
          continue;
        }
        if (outcome === "sign_in") {
          signIn = true;
          break;
        }
        if (outcome === "refused") {
          const refusals = (item.refusals || 0) + 1;
          await putItem(db, {
            ...item,
            refusals,
            lastError: error,
            state: refusals >= BLOCK_AFTER_REFUSALS ? "blocked" : "pending",
          });
        } else {
          await putItem(db, { ...item, failures: (item.failures || 0) + 1, lastError: error });
        }
        break;
      }
    } finally {
      db.close();
      await tell({ type: "outbox-changed", signIn });
    }
  })().finally(() => {
    draining = null;
  });
  return draining;
}

self.addEventListener("sync", (event) => {
  if (event.tag === "ft-outbox") event.waitUntil(drain());
});

// ── messages from the app ─────────────────────────────────────────────

self.addEventListener("message", (event) => {
  const data = event.data || {};
  const reply = (msg) => { if (event.ports && event.ports[0]) event.ports[0].postMessage(msg); };

  if (data.type === "clear") {
    event.waitUntil(caches.delete(PAGE_CACHE).then(() => reply({ cleared: true })));
  } else if (data.type === "drain") {
    event.waitUntil(drain().then(() => reply({ drained: true })));
  } else if (data.type === "warm" && Array.isArray(data.urls)) {
    event.waitUntil(
      Promise.all(data.urls.filter(isFieldPath).map((u) => warmPage(u).catch(() => false))).then((r) =>
        reply({ warmed: r.filter(Boolean).length }),
      ),
    );
  }
});
