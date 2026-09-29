"use client";

import { enqueue, type OutboxItem, type StoredPhoto } from "./outbox-db";

/** A new outbox item: an id made here, nothing tried yet. */
export function newItem(
  kind: OutboxItem["kind"],
  payload: unknown,
  label: string,
  extra: Partial<Pick<OutboxItem, "photoIds" | "upload">> = {},
): OutboxItem {
  return { id: crypto.randomUUID(), kind, payload, label, createdAt: Date.now(), refusals: 0, failures: 0, lastError: null, state: "pending", ...extra };
}

/**
 * Save on the phone first, then ask for it to be sent. True when it is saved
 * — sending is the service worker's job and happens when there is signal.
 */
export async function saveOnPhone(
  outbox: { refresh: () => Promise<void>; sendNow: () => Promise<void> },
  items: OutboxItem[],
  photos: StoredPhoto[] = [],
): Promise<boolean> {
  try {
    await enqueue(items, photos);
  } catch {
    return false;
  }
  void outbox.refresh().then(() => outbox.sendNow());
  return true;
}
