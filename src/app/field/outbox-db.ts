"use client";

/**
 * The phone's own store for the field app (05-field.md §0.1 "Local-first,
 * always"): work is written HERE first, and only then sent.
 *
 * IndexedDB "ft-field", version 2 — THE SAME LAYOUT is read by the service
 * worker (public/field-sw.js), which is the one place items are sent from.
 * Change one, change both, and bump the version in both.
 *
 *   outbox  keyPath "seq" (auto) — one row per piece of work to send, in order
 *     { seq, id (uuid made here), kind, payload, label, createdAt,
 *       refusals, failures, lastError, state: "pending" | "blocked",
 *       photoId? }
 *   photos  keyPath "id" — processed photos waiting for upload
 *     { id, blob, contentType, fileName }
 *   drafts  keyPath "key" — a form in progress, so a closed tab loses nothing
 *     { key, value, savedAt }
 */

export const DB_NAME = "ft-field";
export const DB_VERSION = 2;

export type OutboxState = "pending" | "blocked";

export type OutboxItem = {
  seq?: number;
  id: string;
  kind: "inspection.file" | "inspection.photo" | "stock.move";
  payload: unknown;
  /** What the person reads in the waiting list. */
  label: string;
  createdAt: number;
  refusals: number;
  failures: number;
  lastError: string | null;
  state: OutboxState;
  photoId?: string;
};

export type StoredPhoto = { id: string; blob: Blob; contentType: string; fileName: string };

export function openFieldDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "seq", autoIncrement: true });
      if (!db.objectStoreNames.contains("photos")) db.createObjectStore("photos", { keyPath: "id" });
      if (!db.objectStoreNames.contains("drafts")) db.createObjectStore("drafts", { keyPath: "key" });
      if (!db.objectStoreNames.contains("sent")) db.createObjectStore("sent", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Saving on the phone was interrupted."));
  });
}

function all<T>(store: IDBObjectStore): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const r = store.getAll();
    r.onsuccess = () => resolve(r.result as T[]);
    r.onerror = () => reject(r.error);
  });
}

/**
 * Save work to the phone — every item, and any photos, in ONE transaction,
 * so an inspection never lands without its photo item or the other way round.
 */
export async function enqueue(items: OutboxItem[], photos: StoredPhoto[] = []): Promise<void> {
  const db = await openFieldDb();
  const tx = db.transaction(["outbox", "photos"], "readwrite");
  for (const p of photos) tx.objectStore("photos").put(p);
  for (const i of items) tx.objectStore("outbox").add(i);
  await done(tx);
  db.close();
}

/** Everything waiting, in the order it will be sent. */
export async function listOutbox(): Promise<OutboxItem[]> {
  const db = await openFieldDb();
  const tx = db.transaction("outbox", "readonly");
  const rows = await all<OutboxItem>(tx.objectStore("outbox"));
  db.close();
  return rows.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
}

/**
 * Throw a waiting item away — only ever the person's explicit choice, on a
 * blocked item (05-field.md §0.1: "view the record / discard this change").
 * Anything queued behind it that depends on it (its photo) goes with it.
 */
export async function discardItem(seq: number): Promise<void> {
  const db = await openFieldDb();
  const tx = db.transaction(["outbox", "photos"], "readwrite");
  const outbox = tx.objectStore("outbox");
  const rows = await all<OutboxItem>(outbox);
  const target = rows.find((r) => r.seq === seq);
  if (target) {
    const doomed = rows.filter(
      (r) => r.seq === seq || (r.payload as { inspectionItemId?: string } | null)?.inspectionItemId === target.id,
    );
    for (const r of doomed) {
      if (r.photoId) tx.objectStore("photos").delete(r.photoId);
      outbox.delete(r.seq!);
    }
  }
  await done(tx);
  db.close();
}

/** Give a blocked item another go — the person says it should work now. */
export async function unblockItem(seq: number): Promise<void> {
  const db = await openFieldDb();
  const tx = db.transaction("outbox", "readwrite");
  const store = tx.objectStore("outbox");
  const req = store.get(seq);
  req.onsuccess = () => {
    const row = req.result as OutboxItem | undefined;
    if (row) store.put({ ...row, state: "pending", refusals: 0 });
  };
  await done(tx);
  db.close();
}

export async function readDraft<T>(key: string): Promise<T | null> {
  const db = await openFieldDb();
  const tx = db.transaction("drafts", "readonly");
  const value = await new Promise<T | null>((resolve) => {
    const r = tx.objectStore("drafts").get(key);
    r.onsuccess = () => resolve((r.result?.value as T) ?? null);
    r.onerror = () => resolve(null);
  });
  db.close();
  return value;
}

export async function writeDraft(key: string, value: unknown): Promise<void> {
  const db = await openFieldDb();
  const tx = db.transaction("drafts", "readwrite");
  tx.objectStore("drafts").put({ key, value, savedAt: Date.now() });
  await done(tx);
  db.close();
}

export async function clearDraft(key: string): Promise<void> {
  const db = await openFieldDb();
  const tx = db.transaction("drafts", "readwrite");
  tx.objectStore("drafts").delete(key);
  await done(tx);
  db.close();
}

/**
 * What reached the office, with what it said. A move of forty units where two
 * could not move still moves the other thirty-eight — this is where the phone
 * keeps the two, so they are not silently lost. Written by the service worker.
 */
export type SentRecord = {
  id: string;
  label: string;
  kind: OutboxItem["kind"];
  at: number;
  done?: number;
  problems: { code: string; error: string }[];
};

export async function listSent(): Promise<SentRecord[]> {
  const db = await openFieldDb();
  const rows = await all<SentRecord>(db.transaction("sent", "readonly").objectStore("sent"));
  db.close();
  return rows.sort((a, b) => b.at - a.at);
}
