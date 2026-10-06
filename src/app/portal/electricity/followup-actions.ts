"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { hasGrant } from "@/lib/portal-access";
import { refuseCompleteFollowUp, type RemainingLine } from "@/lib/demo-replacement-followup";
import { resyncCircuitFigures } from "@/lib/circuit-figures";
import { notifyReplacementFollowUpCompleted } from "@/lib/push-notify";

/**
 * The society's own side of the "47 of 50, 3 left with us" handoff
 * (2026-10-06, user-asked) — raised on the admin side when a demo's light
 * replacement was only partial and the society agreed to finish the rest.
 * Marking it done here bumps each remaining line's own replaced count to
 * full and re-derives the circuit's figures, the same transaction shape the
 * admin-side correction already uses.
 */
export async function completeReplacementFollowUp(followUpId: string, note?: string): Promise<{ error?: string }> {
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) return { error: "Your session is no longer valid — please sign in again." };
  if (!hasGrant(viewer, "electricity")) return { error: "You don't have access to this." };

  const f = await db.demoReplacementFollowUp.findUnique({
    where: { id: followUpId },
    select: { id: true, societyId: true, circuitId: true, remaining: true, completedAt: true, voidedAt: true, raisedById: true },
  });
  if (!f || f.societyId !== viewer.societyId) return { error: "That record could not be found." };

  const refusal = refuseCompleteFollowUp(f);
  if (refusal) return { error: refusal };

  const remaining = (f.remaining as unknown as RemainingLine[] | null) ?? [];

  await db.$transaction(async (tx) => {
    for (const line of remaining) {
      const device = await tx.circuitDevice.findUnique({ where: { id: line.lineId }, select: { count: true, replacementTypeId: true, replacementWattage: true } });
      if (!device) continue;
      await tx.circuitDevice.update({
        where: { id: line.lineId },
        data: { replacementCount: device.count },
      });
    }
    await tx.demoReplacementFollowUp.update({
      where: { id: f.id },
      data: { completedAt: new Date(), completedByProfileId: viewer.id, completionNote: note?.trim() || null },
    });
    await resyncCircuitFigures(tx, f.circuitId, null);
  });

  logger.info("demo.replacement_followup_completed_by_society", { followUpId: f.id, profileId: viewer.id, circuitId: f.circuitId });
  await notifyReplacementFollowUpCompleted({ followUpId: f.id, circuitId: f.circuitId, raisedById: f.raisedById });

  revalidatePath("/portal/electricity");
  return {};
}
