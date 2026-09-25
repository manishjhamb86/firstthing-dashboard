"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolveAdmin } from "@/lib/admin-permissions";
import { isOperations } from "@/lib/admin-teams";
import { isEmail } from "@/lib/calendar-event";
import { parseServiceAccount, testCalendarConfig, type CalendarConfig } from "@/lib/google-calendar";

/**
 * Save-and-test in one act (2026-09-25), the tank API's rule: a key that has
 * never obtained a token for the fallback organizer is not stored. The key is
 * write-only — the screen never receives it, and a blank field keeps it.
 */
export async function saveCalendarConfig(input: {
  keyJson: string;
  workspaceDomain: string;
  fallbackOrganizer: string;
}): Promise<{ error?: string; clientEmail?: string }> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!isOperations(actor.team)) {
    logger.warn("calendar.config_refused", { actorId: actor.id, actorTeam: actor.team });
    return { error: "Connecting Google Calendar is an operations action." };
  }
  const domain = input.workspaceDomain.trim().toLowerCase().replace(/^@/, "");
  const fallback = input.fallbackOrganizer.trim().toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return { error: "The Workspace domain looks wrong — e.g. firsthing.earth." };
  if (!isEmail(fallback) || !fallback.endsWith(`@${domain}`)) return { error: `The organizer must be an account on ${domain}.` };

  let key: { clientEmail: string; privateKey: string } | null;
  if (input.keyJson.trim()) {
    key = parseServiceAccount(input.keyJson.trim());
    if (!key) return { error: "That is not a service account key file — paste the whole downloaded JSON." };
  } else {
    const existing = await db.googleCalendarConfig.findUnique({ where: { id: "singleton" } });
    if (!existing) return { error: "Paste the service account's JSON key." };
    key = { clientEmail: existing.clientEmail, privateKey: existing.privateKey };
  }
  const cfg: CalendarConfig = { ...key, workspaceDomain: domain, fallbackOrganizer: fallback, source: "settings" };
  try {
    await testCalendarConfig(cfg);
  } catch (err) {
    logger.warn("calendar.config_test_failed", { actorId: actor.id, error: String(err) });
    return { error: `The connection test failed — nothing was saved. ${err instanceof Error ? err.message : ""}` };
  }
  const data = { clientEmail: key.clientEmail, privateKey: key.privateKey, workspaceDomain: domain, fallbackOrganizer: fallback, enabled: true, updatedById: actor.id, lastOkAt: new Date(), lastError: null };
  await db.googleCalendarConfig.upsert({ where: { id: "singleton" }, create: { id: "singleton", ...data }, update: data });
  logger.info("calendar.config_saved", { actorId: actor.id, clientEmail: key.clientEmail, domain, fallback });
  revalidatePath("/admin/settings/google-calendar");
  revalidatePath("/admin/schedule");
  return { clientEmail: key.clientEmail };
}

/** Pause the sync without losing the key. */
export async function setCalendarEnabled(enabled: boolean): Promise<{ error?: string }> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!isOperations(actor.team)) return { error: "Connecting Google Calendar is an operations action." };
  const r = await db.googleCalendarConfig.updateMany({ where: { id: "singleton" }, data: { enabled, updatedById: actor.id } });
  if (r.count === 0) return { error: "Nothing is connected yet." };
  logger.info("calendar.config_enabled", { actorId: actor.id, enabled });
  revalidatePath("/admin/settings/google-calendar");
  revalidatePath("/admin/schedule");
  return {};
}
