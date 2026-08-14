"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { checkBatchReview, refuseDispute } from "@/lib/onlooker";
import { resolvePortalViewer } from "@/lib/portal-viewer";

// FEAT-035 — the society's daily review. The authorization decision lives in
// src/lib/onlooker.ts (pure, unit-tested); this is the DB/logging shell.
async function loadBatchForReview(batchId: string) {
  const batch = await db.installationBatch.findUnique({
    where: { id: batchId },
    include: { project: true },
  });
  if (!batch) return null;
  return {
    id: batch.id,
    state: batch.state as string,
    societyId: batch.project.societyId,
    // A per-day override falls back to the project's named onlooker; the
    // planned day carries its own only when ops assigned one for that date.
    onlookerId: batch.project.onlookerId,
    pipelineId: batch.project.pipelineId,
    day: batch.day,
  };
}

export async function approveBatch(batchId: string): Promise<{ error?: string; ok?: true }> {
  const viewer = await resolvePortalViewer();
  const batch = await loadBatchForReview(batchId);

  const check = checkBatchReview(viewer, batch);
  if (!check.ok) {
    logger.warn("installation.batch_review_refused", {
      actorId: viewer?.id ?? null,
      actorSocietyId: viewer?.societyId ?? null,
      batchId,
      act: "approve",
      reason: check.reason,
    });
    return { error: check.error };
  }

  await db.$transaction([
    db.batchReview.create({
      data: { batchId, decision: "approved", reviewedById: viewer!.id },
    }),
    db.installationBatch.update({ where: { id: batchId }, data: { state: "approved" } }),
  ]);

  logger.info("installation.batch_approved", {
    actorId: viewer!.id,
    batchId,
    day: batch!.day,
    pipelineId: batch!.pipelineId,
  });

  revalidatePath("/portal");
  revalidatePath(`/admin/pipeline/${batch!.pipelineId}/installation`);
  return { ok: true };
}

export async function disputeBatch(
  batchId: string,
  input: { note: string; location: string; evidencePhotoKeys: string[] },
): Promise<{ error?: string; ok?: true }> {
  const viewer = await resolvePortalViewer();
  const batch = await loadBatchForReview(batchId);

  const check = checkBatchReview(viewer, batch);
  if (!check.ok) {
    logger.warn("installation.batch_review_refused", {
      actorId: viewer?.id ?? null,
      actorSocietyId: viewer?.societyId ?? null,
      batchId,
      act: "dispute",
      reason: check.reason,
    });
    return { error: check.error };
  }

  const evidenceProblem = refuseDispute(input);
  if (evidenceProblem) return { error: evidenceProblem };

  await db.$transaction([
    db.batchReview.create({
      data: {
        batchId,
        decision: "disputed",
        note: input.note.trim(),
        evidenceLocation: input.location.trim(),
        evidencePhotoKeys: input.evidencePhotoKeys,
        reviewedById: viewer!.id,
      },
    }),
    db.installationBatch.update({ where: { id: batchId }, data: { state: "disputed" } }),
  ]);

  // Ops and field are notified, and tomorrow is blocked pending resolution —
  // the block itself is computed by evaluateDayGate, not stored here.
  logger.warn("installation.batch_disputed", {
    actorId: viewer!.id,
    batchId,
    day: batch!.day,
    pipelineId: batch!.pipelineId,
  });

  revalidatePath("/portal");
  revalidatePath(`/admin/pipeline/${batch!.pipelineId}/installation`);
  return { ok: true };
}
