"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolvePortalViewer } from "@/lib/portal-viewer";

/**
 * "Mark all read" — stamps the member's own notificationsSeenAt. Per-member,
 * deliberately: one committee member catching up must not clear another's
 * bell. There is nothing else to check — seeing your own society's feed is
 * what the portal session already is.
 */
export async function markAllRead(): Promise<{ ok: true } | { error: string }> {
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) return { error: "Your session has expired — sign in again." };
  await db.profile.update({
    where: { id: viewer.id },
    data: { notificationsSeenAt: new Date() },
  });
  logger.info("portal.notifications_read", { actorId: viewer.id });
  revalidatePath("/portal/notifications");
  revalidatePath("/portal");
  return { ok: true };
}
