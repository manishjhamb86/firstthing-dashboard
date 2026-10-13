"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { resolveAdmin } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";

/**
 * Acknowledge an alert: someone has seen it and owns it now.
 *
 * On an OPEN alert this is deliberately NOT the same as closing it. The
 * meter is still down — only the poll's own recovery closes an offline
 * alert, and only a reading back inside the ceiling closes an out-of-range
 * one. Acknowledging takes it off the badge without pretending the
 * condition ended, which is the difference between a notification list
 * people trust and one they clear to make the number go away.
 *
 * On a RESOLVED alert (2026-10-13, user-asked), the same field now carries a
 * second, simpler meaning: has anyone actually looked at this row. The
 * Resolved table shows every closed alert in green (the problem IS over),
 * but green alone can't tell a reader "new since you last checked" apart
 * from "you've already seen this" — `acknowledgedAt` is that flag, for
 * either state, one field rather than a second one with the same shape.
 */
export async function acknowledgeAlert(alertId: string): Promise<{ error?: string; ok?: true }> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!actor.permissions.includes("manage_users")) {
    logger.warn("notification.ack_refused", { actorId: actor.id, alertId });
    return { error: "Acknowledging a meter alert is a society-management action (Manage users)." };
  }
  const alert = await db.meterAlert.findUnique({
    where: { id: alertId },
    select: { id: true, closedAt: true, acknowledgedAt: true },
  });
  if (!alert) return { error: "That alert no longer exists." };
  if (alert.acknowledgedAt) return { ok: true };

  await db.meterAlert.update({
    where: { id: alertId },
    data: { acknowledgedAt: new Date(), acknowledgedById: actor.id },
  });
  logger.info("notification.acknowledged", { actorId: actor.id, alertId });
  revalidatePath("/admin/notifications");
  revalidatePath("/admin");
  return { ok: true };
}
