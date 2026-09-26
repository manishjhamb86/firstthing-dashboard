"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { resolveAdmin } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";
import {
  refuseResolve,
  restartsWindow,
  type DemoResolution,
} from "@/lib/demo-result-review";
import { logChange } from "@/lib/change-log";
import { resyncCircuitFigures } from "@/lib/circuit-figures";

export type ResolveReviewResult = { error?: string };

/**
 * FEAT-015-AC-1 — record the resolution and either restart the window or open
 * a manual escalation.
 *
 * FEAT-015-AC-4 gates this to PER-01, via the standing technical proxy (both
 * manage_pipeline and manage_survey). Refuses by returning, never by throwing.
 */
export async function resolveDemoResultReview(
  reviewId: string,
  input: { resolution: string; note: string; loadRevalidatedPct?: number },
): Promise<ResolveReviewResult> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };

  const isOps =
    admin.permissions.includes("manage_pipeline") && admin.permissions.includes("manage_survey");
  if (!isOps) {
    logger.warn("commissioning.demo_review_refused", { actorId: admin.id, reviewId, gate: "per01" });
    return {
      error:
        "Reviewing an out-of-range demo result is an operations lead action. It needs both pipeline and field-survey authority.",
    };
  }

  const review = await db.demoResultReview.findUnique({
    where: { id: reviewId },
    include: { circuit: { select: { id: true, societyId: true, state: true } } },
  });
  if (!review) return { error: "That review no longer exists." };

  const refusal = refuseResolve({
    alreadyResolved: review.state === "resolved",
    resolution: input.resolution,
    note: input.note,
  });
  if (refusal) {
    logger.warn("commissioning.demo_review_refused", { actorId: admin.id, reviewId, reason: refusal });
    return { error: refusal };
  }

  const resolution = input.resolution as DemoResolution;
  const restart = restartsWindow(resolution);

  // The measured average and the review's own record of it are left exactly
  // as they were — a restart measures again, it does not rewrite what the
  // first attempt found (ADR-005).
  await db.$transaction(async (tx) => {
    await tx.demoResultReview.update({
      where: { id: reviewId },
      data: {
        state: "resolved",
        resolution,
        resolutionNote: input.note.trim(),
        loadRevalidatedPct: input.loadRevalidatedPct ?? null,
        resolvedById: admin.id,
        resolvedAt: new Date(),
      },
    });

    if (restart && review.demoId) {
      // Measure again: the post-installation set is withdrawn (a new, empty
      // acceptance version — every earlier one stays on record) and the
      // period is cleared so it is chosen afresh.
      const demo = await tx.circuitDemo.findUnique({ where: { id: review.demoId }, select: { postFrom: true, postTo: true } });
      const last = await tx.circuitDemoAcceptance.findFirst({ where: { demoId: review.demoId, phase: "post" }, orderBy: { version: "desc" }, select: { version: true } });
      await tx.circuitDemoAcceptance.create({
        data: { demoId: review.demoId, phase: "post", version: (last?.version ?? 0) + 1, days: [], averageKwh: null, countedDays: 0, acceptedById: admin.id },
      });
      await tx.circuitDemo.update({ where: { id: review.demoId }, data: { postFrom: null, postTo: null } });
      await logChange(tx, {
        entity: "circuit_demo", entityId: review.demoId, kind: "edit", field: "post_withdrawn_by_review", circuitId: review.circuitId, demoId: review.demoId,
        oldValue: { postFrom: demo?.postFrom?.toISOString().slice(0, 10) ?? null, postTo: demo?.postTo?.toISOString().slice(0, 10) ?? null },
        reason: input.note.trim(), actorId: admin.id,
      });
      await resyncCircuitFigures(tx, review.circuitId, admin.id);
    }
    // An escalation deliberately leaves the circuit in `benchmark_review`:
    // measurement is not going to settle it, and moving the circuit on would
    // hide that a person still owes a decision.
  });

  logger.info("commissioning.demo_review_resolved", {
    actorId: admin.id,
    reviewId,
    circuitId: review.circuitId,
    resolution,
    occurrence: review.occurrence,
    restartedWindow: restart,
  });

  revalidatePath(`/admin/societies/${review.circuit.societyId}/circuits/${review.circuitId}`);
  revalidatePath("/admin/demo-monitoring");
  return {};
}
