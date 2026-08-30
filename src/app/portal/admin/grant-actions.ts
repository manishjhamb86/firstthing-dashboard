"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { checkGrantEdit, sanitizeGrants } from "@/lib/portal-access";
import { resolvePortalViewer } from "@/lib/portal-viewer";

/**
 * The office-bearer sets what a member can access (customer portal,
 * 2026-08-29). The decision itself is checkGrantEdit — pure, unit-tested —
 * and this action is its thin shell: resolve the actor from the row, load
 * the target, refuse with a typed error, log every outcome.
 */
export async function setMemberGrants(
  targetId: string,
  values: string[],
): Promise<{ ok: true } | { error: string }> {
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) return { error: "Your session has expired — sign in again." };

  const grants = sanitizeGrants(values);
  if (grants === null) {
    logger.warn("portal.grants_refused", { actorId: viewer.id, targetId, reason: "unknown_grant" });
    return { error: "That is not an access this portal has." };
  }

  const target = await db.profile.findUnique({
    where: { id: targetId },
    select: { id: true, societyId: true, portalAuthority: true, isActive: true },
  });
  if (!target || !target.isActive) return { error: "That account is not an active member." };

  const check = checkGrantEdit(
    { id: viewer.id, role: viewer.role, societyId: viewer.societyId },
    target,
  );
  if (!check.ok) {
    logger.warn("portal.grants_refused", { actorId: viewer.id, targetId, reason: check.error });
    return { error: check.error };
  }

  await db.profile.update({ where: { id: target.id }, data: { grants } });
  logger.info("portal.grants_set", {
    actorId: viewer.id,
    targetId: target.id,
    societyId: viewer.societyId,
    grants,
  });
  revalidatePath("/portal/admin");
  return { ok: true };
}
