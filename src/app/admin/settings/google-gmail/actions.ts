"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolveAdmin } from "@/lib/admin-permissions";
import { isSuperAdmin } from "@/lib/super-admin";
import { isEmail } from "@/lib/calendar-event";
import { parseServiceAccount } from "@/lib/google-calendar";
import { testGmailConfig, type GmailConfig } from "@/lib/google-gmail";

/**
 * Save-and-test in one act, the same rule as Google Calendar's own config:
 * a key that has never obtained a token for the dedicated mailbox is not
 * stored. The key is write-only — the screen never receives it, and a
 * blank field keeps it.
 */
export async function saveGmailConfig(input: { keyJson: string; mailbox: string }): Promise<{ error?: string; clientEmail?: string }> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!isSuperAdmin(actor.email)) {
    logger.warn("gmail.config_refused", { actorId: actor.id, actorTeam: actor.team });
    return { error: "Connecting Gmail is restricted to one account." };
  }
  const mailbox = input.mailbox.trim().toLowerCase();
  if (!isEmail(mailbox)) return { error: "That is not a valid mailbox address." };

  let key: { clientEmail: string; privateKey: string } | null;
  if (input.keyJson.trim()) {
    key = parseServiceAccount(input.keyJson.trim());
    if (!key) return { error: "That is not a service account key file — paste the whole downloaded JSON." };
  } else {
    const existing = await db.googleGmailConfig.findUnique({ where: { id: "singleton" } });
    if (!existing) return { error: "Paste the service account's JSON key." };
    key = { clientEmail: existing.clientEmail, privateKey: existing.privateKey };
  }
  const cfg: GmailConfig = { ...key, mailbox, source: "settings" };
  try {
    await testGmailConfig(cfg);
  } catch (err) {
    logger.warn("gmail.config_test_failed", { actorId: actor.id, error: String(err) });
    return { error: `The connection test failed — nothing was saved. ${err instanceof Error ? err.message : ""}` };
  }
  const data = { clientEmail: key.clientEmail, privateKey: key.privateKey, mailbox, enabled: true, updatedById: actor.id, lastOkAt: new Date(), lastError: null };
  await db.googleGmailConfig.upsert({ where: { id: "singleton" }, create: { id: "singleton", ...data }, update: data });
  logger.info("gmail.config_saved", { actorId: actor.id, clientEmail: key.clientEmail, mailbox });
  revalidatePath("/admin/settings/google-gmail");
  revalidatePath("/admin/pump-rooms");
  return { clientEmail: key.clientEmail };
}

/** Pause ingestion without losing the key. */
export async function setGmailEnabled(enabled: boolean): Promise<{ error?: string }> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!isSuperAdmin(actor.email)) return { error: "Connecting Gmail is restricted to one account." };
  const r = await db.googleGmailConfig.updateMany({ where: { id: "singleton" }, data: { enabled, updatedById: actor.id } });
  if (r.count === 0) return { error: "Nothing is connected yet." };
  logger.info("gmail.config_enabled", { actorId: actor.id, enabled });
  revalidatePath("/admin/settings/google-gmail");
  revalidatePath("/admin/pump-rooms");
  return {};
}
