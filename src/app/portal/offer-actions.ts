"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { checkOfferResponse } from "@/lib/offer-authority";

// FEAT-108-AC-1 / GATE-04 — the society's own acceptance of an offer, the
// binding act MS-02 could only stand in for (it used the office-bearer
// transfer, because no Offer entity existed yet). This is the real one.
//
// The viewer is resolved from the Profile row, never the JWT: an authority
// transferred away mid-session must stop being exercisable immediately, and
// accepting a contract is precisely the act where that matters most.
export async function respondToOffer(
  offerId: string,
  outcome: "accepted" | "rejected",
  note: string,
): Promise<{ error?: string }> {
  const viewer = await resolvePortalViewer();

  const offer = await db.offer.findUnique({
    where: { id: offerId },
    include: { pipeline: { select: { id: true, societyId: true } } },
  });

  const check = checkOfferResponse(
    viewer ? { id: viewer.id, role: viewer.role, societyId: viewer.societyId } : null,
    offer ? { id: offer.id, status: offer.status, pipelineSocietyId: offer.pipeline.societyId } : null,
  );

  if (!check.ok) {
    logger.warn("gate04.binding_act_refused", {
      actorId: viewer?.id ?? null,
      actorRole: viewer?.role ?? null,
      actorSocietyId: viewer?.societyId ?? null,
      offerId,
      act: "respond_to_offer",
      reason: check.reason,
    });
    return { error: check.error };
  }

  if (outcome === "rejected" && !note.trim()) {
    return { error: "Please say what didn't work — it helps us come back with something better." };
  }

  await db.$transaction([
    db.offer.update({
      where: { id: offerId },
      data: {
        status: outcome,
        respondedAt: new Date(),
        respondedById: viewer!.id,
        responseNote: note.trim() || null,
      },
    }),
    // FEAT-028-AC-1 — acceptance advances the pipeline to agreement
    // preparation. A rejection deliberately does not close the deal: it is
    // flagged and usually followed by a counter (AC-3).
    ...(outcome === "accepted"
      ? [db.pipeline.update({ where: { id: offer!.pipeline.id }, data: { stage: "offered" } })]
      : []),
  ]);

  logger.info("portal.offer_response", {
    actorId: viewer!.id,
    societyId: viewer!.societyId,
    offerId,
    outcome,
  });

  revalidatePath("/portal");
  revalidatePath(`/admin/pipeline/${offer!.pipeline.id}/offer`);
  return {};
}
