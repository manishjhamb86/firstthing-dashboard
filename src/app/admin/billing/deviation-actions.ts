"use server";

import { revalidatePath } from "next/cache";
import type { DeviationRootCause } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { refuseDecision, rootCauseMeta } from "@/lib/deviation-review";
import { requireBillingOps } from "./access";

type Result = { error: string } | { ok: true };

/**
 * FEAT-055 — the review's own steps. Every one of these is PER-01's
 * (requireBillingOps): FEAT-055-AC-4 says deviations are not visible to
 * anyone else at all, because they are internal billing judgments and not
 * customer-facing.
 *
 * Each refuses by RETURNING, never by throwing — a thrown Server Action
 * reaches a production browser as an opaque digest, so the operator would be
 * told nothing. That defect was found twice in this codebase already.
 */
async function loadReview(id: string) {
  return db.deviationReview.findUnique({
    where: { id },
    include: {
      feeLine: {
        include: {
          calculation: { select: { id: true, period: true, societyId: true, status: true } },
          circuit: { select: { lightType: true, location: true } },
        },
      },
    },
  });
}

export async function assignDeviation(input: { id: string; toId: string }): Promise<Result> {
  const gate = await requireBillingOps();
  if (!gate.ok) return { error: gate.error };
  const review = await loadReview(input.id);
  if (!review) return { error: "That deviation review no longer exists." };
  if (review.state === "closed") return { error: "This review is closed." };

  const assignee = await db.adminUser.findFirst({
    where: { id: input.toId, isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (!assignee) return { error: "That account cannot take an assignment." };

  await db.deviationReview.update({
    where: { id: input.id },
    data: { assignedToId: input.toId, assignedAt: new Date(), state: "assigned" },
  });
  logger.info("deviation.assigned", { reviewId: input.id, toId: input.toId, byId: gate.actor.id });
  revalidatePath(`/admin/billing/deviations/${input.id}`);
  revalidatePath("/admin/billing/deviations");
  return { ok: true };
}

export async function recordFindings(input: { id: string; findings: string }): Promise<Result> {
  const gate = await requireBillingOps();
  if (!gate.ok) return { error: gate.error };
  const review = await loadReview(input.id);
  if (!review) return { error: "That deviation review no longer exists." };
  if (review.state === "closed") return { error: "This review is closed." };
  if (input.findings.trim() === "") return { error: "Record what the investigation found." };

  await db.deviationReview.update({
    where: { id: input.id },
    data: {
      findings: input.findings.trim(),
      // A review that already carries a decision does not fall back a step
      // just because its findings were extended.
      state: review.state === "decided" || review.state === "escalated" ? review.state : "investigated",
    },
  });
  logger.info("deviation.findings_recorded", { reviewId: input.id, byId: gate.actor.id });
  revalidatePath(`/admin/billing/deviations/${input.id}`);
  return { ok: true };
}

/**
 * INV-03 made literal: a bill-changing deviation decision carries an owner
 * and a root-cause classification, never just a fixable/not-fixable flag.
 *
 * The decision changes nothing about THIS month — CON-01c is explicit that
 * month 1 never adjusts. What it does is set the condition next month's run
 * reads, which is why there is no "apply the adjustment" action anywhere:
 * the adjustment happens by re-running the following month.
 */
export async function decideDeviation(input: {
  id: string;
  rootCause: DeviationRootCause | null;
  decision: string;
  correctedAtNoCost: boolean;
  societyExplanation: string;
  close: boolean;
}): Promise<Result> {
  const gate = await requireBillingOps();
  if (!gate.ok) return { error: gate.error };
  const review = await loadReview(input.id);
  if (!review) return { error: "That deviation review no longer exists." };
  if (review.state === "closed") return { error: "This review is already closed." };

  // GATE-02 — a released month's figures are final, and a decision here is
  // what next month's pricing reads. Recording one against a released month
  // is fine; what is refused is re-deciding after the fact in a way that
  // would change a figure already in a society's hands.
  const refusal = refuseDecision({
    rootCause: input.rootCause,
    correctedAtNoCost: input.correctedAtNoCost,
    decision: input.decision,
    societyExplanation: input.societyExplanation,
    ownerId: gate.actor.id,
  });
  if (refusal) {
    logger.warn("deviation.decision_refused", {
      reviewId: input.id,
      actorId: gate.actor.id,
      reason: refusal,
    });
    return { error: refusal };
  }

  const meta = rootCauseMeta(input.rootCause!);
  // `correctedAtNoCost` only means anything for the cause that counts
  // against the guarantee; storing it as true on an excluded cause would
  // read as a correction FirsThing never had to make.
  const corrected = meta.countsAgainstGuarantee ? input.correctedAtNoCost : false;
  const now = new Date();

  await db.deviationReview.update({
    where: { id: input.id },
    data: {
      rootCause: input.rootCause,
      decision: input.decision.trim(),
      correctedAtNoCost: corrected,
      societyExplanation: meta.countsAgainstGuarantee ? null : input.societyExplanation.trim(),
      ownerId: gate.actor.id,
      decidedAt: now,
      state: input.close ? "closed" : "decided",
      closedAt: input.close ? now : null,
    },
  });
  logger.info("deviation.decided", {
    reviewId: input.id,
    ownerId: gate.actor.id,
    rootCause: input.rootCause,
    correctedAtNoCost: corrected,
    countsAgainstGuarantee: meta.countsAgainstGuarantee,
    exposesNextMonth: meta.countsAgainstGuarantee && !corrected,
    period: review.feeLine.calculation.period,
  });
  revalidatePath(`/admin/billing/deviations/${input.id}`);
  revalidatePath("/admin/billing/deviations");
  revalidatePath(`/admin/billing/${review.feeLine.calculation.id}`);
  return { ok: true };
}

export async function reopenDeviation(input: { id: string; reason: string }): Promise<Result> {
  const gate = await requireBillingOps();
  if (!gate.ok) return { error: gate.error };
  if (input.reason.trim() === "") return { error: "Say why this is being reopened." };
  const review = await loadReview(input.id);
  if (!review) return { error: "That deviation review no longer exists." };
  if (review.state !== "closed") return { error: "This review is not closed." };

  await db.deviationReview.update({
    where: { id: input.id },
    data: {
      state: "escalated",
      closedAt: null,
      escalatedAt: new Date(),
      escalationNote: input.reason.trim(),
    },
  });
  logger.warn("deviation.reopened", { reviewId: input.id, byId: gate.actor.id });
  revalidatePath(`/admin/billing/deviations/${input.id}`);
  revalidatePath("/admin/billing/deviations");
  return { ok: true };
}
