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
import { restartFromDate } from "@/lib/commissioning-anomaly";

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

    if (restart) {
      const latest = await tx.commissioningReading.findFirst({
        where: { circuitId: review.circuitId, windowType: "post_install" },
        orderBy: { date: "desc" },
        select: { date: true },
      });
      await tx.circuit.update({
        where: { id: review.circuitId },
        data: {
          // Clearing the average is what makes the window re-runnable — the
          // completion check refuses a window whose baseline is already set.
          postInstallBaseline: null,
          postInstallWindowStartAt: restartFromDate(new Date(), latest?.date ?? null),
          state: "post_install_monitoring",
        },
      });
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
