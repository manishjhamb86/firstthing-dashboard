"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { checkOfficeBearerTransfer } from "@/lib/portal-authority";
import { resolvePortalViewer } from "@/lib/portal-viewer";

// FEAT-108-AC-5 (office-bearer transfers the designation to another account
// of the same society) — this is R0's stand-in "binding act" for GATE-04,
// since accepting an offer (FEAT-108-AC-1/2) needs the Offer entity, which
// doesn't exist until a later milestone. The authorization decision itself
// lives in src/lib/portal-authority.ts (unit-tested, NFR-05's first slice) —
// this action is just the Next.js/DB shell around it.
export async function transferOfficeBearer(targetProfileId: string): Promise<{ error?: string }> {
  // Resolved from the Profile row, not the session's claims — an authority
  // transferred away mid-session must stop being exercisable immediately,
  // which a JWT minted at login cannot express. See src/lib/portal-viewer.ts.
  const viewer = await resolvePortalViewer();
  if (!viewer) return { error: "Your session is no longer valid — please sign in again." };

  const target = await db.profile.findUnique({ where: { id: targetProfileId } });

  const check = checkOfficeBearerTransfer(
    { id: viewer.id, role: viewer.role, societyId: viewer.societyId },
    target,
  );

  if (!check.ok) {
    logger.warn("gate04.binding_act_refused", {
      actorId: viewer.id,
      actorRole: viewer.role,
      actorSocietyId: viewer.societyId,
      targetProfileId,
      targetSocietyId: target?.societyId ?? null,
      act: "transfer_office_bearer",
      reason: check.reason,
    });
    return { error: check.error };
  }

  // The schema's portalAuthority is a single value per account (MS-01 scope,
  // not yet a set) — FEAT-108-AC-5's "previous one keeps its other
  // authorities" is provisionally satisfied by demoting the outgoing
  // office-bearer to `committee` rather than clearing their access outright.
  // Real multi-authority-per-account modeling, if ever needed, is a later
  // schema decision, not guessed here.
  await db.$transaction([
    db.profile.update({ where: { id: viewer.id }, data: { portalAuthority: "committee" } }),
    db.profile.update({ where: { id: target!.id }, data: { portalAuthority: "office_bearer" } }),
  ]);

  logger.info("portal.office_bearer_transferred", {
    societyId: viewer.societyId,
    fromProfileId: viewer.id,
    toProfileId: target!.id,
  });

  revalidatePath("/portal");
  return {};
}
