"use server";

import { revalidatePath } from "next/cache";
import type { BlockerType } from "@prisma/client";
import { db } from "@/lib/db";
import { demoBypass } from "@/lib/demo-mode";
import { requireAdmin, requireAdminPermission } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";
import {
  completionBlockers,
  describeCompletionBlocker,
  evaluateDayGate,
  refuseGateSkip,
  SKIP_REFUSAL_MESSAGE,
  type BatchGateInput,
} from "@/lib/installation-gate";
import { prorateFirstMonth } from "@/lib/billing-start";

// The "PER-01 specifically" technical proxy this codebase settled at MS-03:
// there is no third permission marker for ops, and a real PER-01 account
// holds every back-office permission, so requiring both stands in for it.
// Project setup, blocker resolution, gate skips and completion are all
// PER-01's (FEAT-033-AC-4, FEAT-036-AC-4, FEAT-037-AC-4).
async function requireOps() {
  const session = await requireAdminPermission("manage_pipeline");
  if (!session.user.adminPermissions?.includes("manage_survey")) {
    return { error: "This is an operations lead action. It needs both pipeline and field-survey authority." as const };
  }
  return { session };
}

// PER-04 — field staff log batches and raise blockers (FEAT-034-AC-4,
// FEAT-036-AC-4). manage_survey alone, deliberately: a pure field account
// must be able to do this without any sales authority.
async function requireField() {
  return requireAdminPermission("manage_survey");
}

function pathFor(pipelineId: string) {
  return `/admin/pipeline/${pipelineId}/installation`;
}

function toGateInput(b: {
  id: string;
  areaKey: string;
  state: string;
  submittedAt: Date | null;
  review: { reviewedAt: Date } | null;
}): BatchGateInput {
  return {
    id: b.id,
    areaKey: b.areaKey,
    state: b.state as BatchGateInput["state"],
    submittedAt: b.submittedAt,
    reviewedAt: b.review?.reviewedAt ?? null,
  };
}

// ── FEAT-033 — project setup & batch plan ────────────────────────────────

export type PlannedDayInput = {
  day: number;
  plannedDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM — CON-21's deadline counts back from this
  areaKey: string;
  plannedCount: number;
  assignedToId: string | null;
};

export async function setUpInstallationProject(
  pipelineId: string,
  input: {
    contractedLightCount: number;
    scopeVarianceNote: string;
    onlookerId: string;
    days: PlannedDayInput[];
  },
) {
  const ops = await requireOps();
  if ("error" in ops) return ops;
  const { session } = ops;

  const pipeline = await db.pipeline.findUnique({
    where: { id: pipelineId },
    include: {
      contract: true,
      society: true,
      siteSurvey: { include: { areas: true } },
      installationProject: true,
    },
  });
  if (!pipeline) return { error: "Deal not found." };

  // FEAT-033 depends on FEAT-029: the project exists because a contract does.
  // Installation commits FirsThing's own capital, so this is a hard gate for
  // the same reason the executed-agreement upload is.
  if (!pipeline.contract || pipeline.contract.status !== "active") {
    return { error: "An active contract is needed first — installation cannot be planned against an unexecuted agreement." };
  }

  // FEAT-033-AC-3 — the daily review gate has no meaning without a named
  // reviewer, so setup cannot complete without one.
  if (!input.onlookerId) {
    return { error: "Name the society's onlooker. CON-21's daily review gate cannot run without one, and a day nobody reviews is a day that cannot complete." };
  }
  const onlooker = await db.profile.findUnique({ where: { id: input.onlookerId } });
  if (!onlooker || onlooker.societyId !== pipeline.societyId) {
    // INV-05 — the onlooker must belong to this society, not merely exist.
    logger.warn("installation.onlooker_rejected", { actorId: session.user.id, pipelineId, onlookerId: input.onlookerId });
    return { error: "That account does not belong to this society." };
  }
  if (!onlooker.isActive) return { error: "That portal account is deactivated." };

  if (input.days.length === 0) return { error: "Plan at least one day of work." };
  if (input.contractedLightCount <= 0) return { error: "The contracted scope must be a positive light count." };

  const surveyed = (pipeline.siteSurvey?.areas ?? []).reduce((n, a) => n + a.count, 0);

  // SCR-060: the plan must reconcile to the contracted scope. A mismatch is
  // either a planning error or an undocumented scope change, and both are far
  // cheaper to resolve now than on site.
  const planned = input.days.reduce((n, d) => n + d.plannedCount, 0);
  if (planned !== input.contractedLightCount) {
    return {
      error: `The plan covers ${planned} lights but the contracted scope is ${input.contractedLightCount}. Reconcile them before publishing — a gap here becomes a dispute on site.`,
    };
  }

  // FEAT-033-AC-5 — where contracted differs from surveyed, the difference is
  // *recorded*. The survey is not edited to match: it stays a record of what
  // exists, and the project records what is contracted.
  if (surveyed !== input.contractedLightCount && !input.scopeVarianceNote.trim()) {
    return {
      error: `The survey found ${surveyed} lights and the contracted scope is ${input.contractedLightCount}. Record why they differ — the survey stays as it is.`,
    };
  }

  const dayRows = input.days.map((d) => {
    const startAt = new Date(`${d.plannedDate}T${d.startTime || "09:00"}:00.000Z`);
    if (Number.isNaN(startAt.getTime())) throw new Error(`Day ${d.day} has an unreadable date or start time.`);
    return {
      day: d.day,
      plannedDate: new Date(`${d.plannedDate}T00:00:00.000Z`),
      startAt,
      areaKey: d.areaKey.trim(),
      plannedCount: d.plannedCount,
      assignedToId: d.assignedToId || null,
    };
  });
  if (dayRows.some((d) => !d.areaKey)) return { error: "Every planned day needs an area." };

  const project = await db.$transaction(async (tx) => {
    const created = await tx.installationProject.upsert({
      where: { pipelineId },
      create: {
        pipelineId,
        societyId: pipeline.societyId,
        surveyedLightCount: surveyed,
        contractedLightCount: input.contractedLightCount,
        scopeVarianceNote: input.scopeVarianceNote.trim() || null,
        onlookerId: input.onlookerId,
        state: "published",
        publishedAt: new Date(),
        createdById: session.user.id,
      },
      update: {
        contractedLightCount: input.contractedLightCount,
        scopeVarianceNote: input.scopeVarianceNote.trim() || null,
        onlookerId: input.onlookerId,
        state: "published",
        publishedAt: new Date(),
      },
    });

    // Replanning replaces the day rows; batches keep their own copy of day and
    // area, so already-logged work is never orphaned by a replan.
    await tx.installationPlannedDay.deleteMany({ where: { projectId: created.id } });
    await tx.installationPlannedDay.createMany({
      data: dayRows.map((d) => ({ ...d, projectId: created.id })),
    });

    await tx.pipeline.update({ where: { id: pipelineId }, data: { stage: "installation" } });
    return created;
  });

  logger.info("installation.project_published", {
    actorId: session.user.id,
    pipelineId,
    projectId: project.id,
    days: dayRows.length,
    contractedLightCount: input.contractedLightCount,
    surveyedLightCount: surveyed,
  });

  revalidatePath(pathFor(pipelineId));
  return { ok: true as const };
}

// ── FEAT-034 — daily batch logging ───────────────────────────────────────

export async function startBatch(pipelineId: string, plannedDayId: string) {
  const session = await requireField();

  const day = await db.installationPlannedDay.findUnique({
    where: { id: plannedDayId },
    include: { project: { include: { batches: { include: { review: true } } } } },
  });
  if (!day || day.project.pipelineId !== pipelineId) return { error: "That planned day is not part of this project." };

  const existing = day.project.batches.find((b) => b.plannedDayId === plannedDayId);
  if (existing) return { ok: true as const, batchId: existing.id };

  // CON-21 reaches back into capture: a day that cannot start should not be
  // able to open a batch either, or the crew discovers the block on arrival —
  // which is precisely what FEAT-035-AC-3 exists to prevent.
  const previous = day.project.batches.filter((b) => b.day === day.day - 1).map(toGateInput);
  const gate = evaluateDayGate({
    ignoreDeadline: demoBypass("installation_review_deadline", { plannedDayId: day?.id }),
    previousBatches: previous,
    startAt: day.startAt,
    now: new Date(),
    skipUsedForDay: day.project.gateSkipBatchId
      ? day.project.batches.some((b) => b.id === day.project.gateSkipBatchId && b.day === day.day - 1)
      : false,
  });
  if (!gate.canStart) {
    logger.warn("installation.day_blocked", { actorId: session.user.id, pipelineId, day: day.day, status: gate.status });
    return { error: gate.reason ?? "The previous day has not cleared the society's review." };
  }

  // CON-44/ADR-007 — the visit is a team, and the area claim is placed here.
  // Batches are area-scoped from creation, so this claim cannot collide with
  // another technician's; the model still records who holds which area,
  // which is what makes the survey case (the hard one) work on the same
  // tables later.
  const batch = await db.$transaction(async (tx) => {
    const visit = await tx.fieldVisit.create({
      data: {
        type: "installation_day",
        sourceType: "InstallationProject",
        sourceId: day.projectId,
        societyId: day.project.societyId,
        state: "in_progress",
        scheduledFor: day.startAt,
        participants: { create: { userId: session.user.id, acceptedAt: new Date() } },
        areaClaims: { create: { areaKey: day.areaKey, claimedById: session.user.id } },
      },
    });
    return tx.installationBatch.create({
      data: {
        projectId: day.projectId,
        plannedDayId: day.id,
        fieldVisitId: visit.id,
        day: day.day,
        areaKey: day.areaKey,
        state: "draft",
      },
    });
  });

  logger.info("installation.batch_started", { actorId: session.user.id, pipelineId, batchId: batch.id, day: day.day });
  revalidatePath(pathFor(pipelineId));
  return { ok: true as const, batchId: batch.id };
}

export async function submitBatch(
  pipelineId: string,
  batchId: string,
  input: {
    installedCount: number;
    removedFittingsCount: number;
    skippedCount: number;
    skippedReason: string;
    locationDetail: string;
    photoKeys: string[];
  },
) {
  const session = await requireField();

  const batch = await db.installationBatch.findUnique({
    where: { id: batchId },
    include: { project: true, fieldVisit: { include: { areaClaims: true } } },
  });
  if (!batch || batch.project.pipelineId !== pipelineId) return { error: "Batch not found." };
  if (batch.state !== "draft") return { error: "This batch has already been submitted." };

  // FEAT-034-AC-3 — photos are what make the society's review and any dispute
  // resolvable. Without them a dispute is one person's word against another's.
  if (input.photoKeys.length === 0) {
    return { error: "Photo evidence is required. The society reviews this batch against the photos, and a dispute has to be checkable by someone standing in the building tomorrow." };
  }
  if (input.installedCount < 0 || input.skippedCount < 0) return { error: "Counts cannot be negative." };
  if (input.installedCount === 0 && input.skippedCount === 0) return { error: "Record what was installed." };
  // FEAT-034-AC-5 — a skipped fixture stays in outstanding scope with a
  // reason. Silently reducing scope is how a society ends up billed for
  // lights nobody fitted.
  if (input.skippedCount > 0 && !input.skippedReason.trim()) {
    return { error: "Say why those fixtures were skipped — they stay in the project's outstanding scope either way." };
  }

  // CON-44 — submission is blocked while any area is contested. Installation
  // is uncontested by construction, so this should never fire here; it is
  // written anyway because the rule belongs to submission, not to the survey
  // surface that will exercise it harder.
  const contested = (batch.fieldVisit?.areaClaims ?? []).filter((c) => c.status === "contested");
  if (contested.length > 0) {
    return { error: `${contested.length} area claim(s) are contested. Resolve each by hand before submitting — the rows are never merged automatically.` };
  }

  await db.$transaction(async (tx) => {
    await tx.installationBatch.update({
      where: { id: batchId },
      data: {
        installedCount: input.installedCount,
        removedFittingsCount: input.removedFittingsCount,
        skippedCount: input.skippedCount,
        skippedReason: input.skippedReason.trim() || null,
        locationDetail: input.locationDetail.trim() || null,
        photoKeys: input.photoKeys,
        state: "awaiting_review",
        submittedById: session.user.id,
        submittedAt: new Date(),
      },
    });
    if (batch.fieldVisitId) {
      await tx.fieldVisit.update({ where: { id: batch.fieldVisitId }, data: { state: "submitted" } });
    }
  });

  // XS-06 — the onlooker is notified here. Real delivery is NFR-10/R1; the
  // log line is the audit trail this build commits to in the meantime.
  logger.info("installation.batch_submitted", {
    actorId: session.user.id,
    pipelineId,
    batchId,
    day: batch.day,
    areaKey: batch.areaKey,
    installedCount: input.installedCount,
    onlookerNotified: batch.project.onlookerId,
  });

  revalidatePath(pathFor(pipelineId));
  revalidatePath("/portal");
  return { ok: true as const };
}

/**
 * SCR-061's "reopen" — the way a disputed day gets fixed.
 *
 * Found while walking the flow rather than while reading the spec: FEAT-035
 * lets the society dispute a batch and FEAT-037 refuses completion while any
 * batch is disputed, but nothing in either feature returns a disputed batch
 * to a workable state. Without this a single dispute makes a project
 * permanently uncompletable, which is not what "tomorrow blocked pending
 * resolution" means.
 *
 * The crew redoes the work and resubmits, and it goes back to the society —
 * deliberately *not* an ops override that marks it approved, because the
 * society's approval is the only thing CON-21's gate accepts.
 */
export async function reopenBatch(pipelineId: string, batchId: string, reason: string) {
  const session = await requireField();

  const batch = await db.installationBatch.findUnique({
    where: { id: batchId },
    include: { project: true, review: true },
  });
  if (!batch || batch.project.pipelineId !== pipelineId) return { error: "Batch not found." };
  if (batch.state === "approved") {
    return { error: "That day is approved. Reopening approved work would put an already-cleared gate back in doubt." };
  }
  if (batch.state === "draft") return { error: "That batch is already open." };
  if (!reason.trim()) return { error: "Say why it is being reopened." };

  await db.$transaction(async (tx) => {
    // The review is removed with the reopen: the society reviews the redone
    // work, not the old submission. The dispute itself stays visible in the
    // log line below rather than silently vanishing.
    if (batch.review) await tx.batchReview.delete({ where: { batchId } });
    await tx.installationBatch.update({
      where: { id: batchId },
      data: { state: "draft", submittedAt: null, skippedReason: batch.skippedReason },
    });
  });

  logger.info("installation.batch_reopened", {
    actorId: session.user.id,
    pipelineId,
    batchId,
    previousState: batch.state,
    previousDecision: batch.review?.decision ?? null,
    reason: reason.trim(),
  });

  revalidatePath(pathFor(pipelineId));
  revalidatePath("/portal");
  return { ok: true as const };
}

// ── FEAT-035 — the once-per-project gate skip (backend side) ─────────────

export async function skipReviewGate(pipelineId: string, blockedDayId: string, reason: string) {
  const ops = await requireOps();
  if ("error" in ops) return ops;
  const { session } = ops;

  const day = await db.installationPlannedDay.findUnique({
    where: { id: blockedDayId },
    include: { project: { include: { batches: { include: { review: true } } } } },
  });
  if (!day || day.project.pipelineId !== pipelineId) return { error: "That planned day is not part of this project." };

  const previous = day.project.batches.filter((b) => b.day === day.day - 1).map(toGateInput);
  const gate = evaluateDayGate({
    previousBatches: previous,
    startAt: day.startAt,
    now: new Date(),
    ignoreDeadline: demoBypass("installation_review_deadline", { plannedDayId: day.id }),
  });

  const refusal = refuseGateSkip({
    gateSkipUsedAt: day.project.gateSkipUsedAt,
    reason,
    gateBlocked: !gate.canStart,
  });
  if (refusal) {
    logger.warn("installation.gate_skip_refused", { actorId: session.user.id, pipelineId, reason: refusal });
    return { error: SKIP_REFUSAL_MESSAGE[refusal] };
  }

  // The blocking batch is recorded, not just the fact of a skip — so the day
  // the gate was bypassed is identifiable afterward.
  const blockingBatch = gate.outstanding[0] ?? gate.disputed[0] ?? null;

  await db.installationProject.update({
    where: { id: day.projectId },
    data: {
      gateSkipUsedAt: new Date(),
      gateSkipBatchId: blockingBatch?.id ?? null,
      gateSkipApprovedBy: session.user.id,
      gateSkipReason: reason.trim(),
    },
  });

  logger.warn("installation.gate_skipped", {
    actorId: session.user.id,
    pipelineId,
    projectId: day.projectId,
    day: day.day,
    blockingBatchId: blockingBatch?.id ?? null,
  });

  revalidatePath(pathFor(pipelineId));
  return { ok: true as const };
}

// ── FEAT-036 — blockers & requirement changes ────────────────────────────

export async function raiseBlocker(
  pipelineId: string,
  input: {
    type: BlockerType;
    areaKey: string;
    detail: string;
    batchId: string | null;
    affectedDate: string | null;
    discoveredLightCount: number | null;
    photoKeys: string[];
  },
) {
  const session = await requireField();

  const project = await db.installationProject.findUnique({ where: { pipelineId } });
  if (!project) return { error: "No installation project for this deal." };
  if (!input.detail.trim()) return { error: "Describe the blocker — ops sees this, not the site." };

  // FEAT-036-AC-5 — a count discrepancy is the one blocker type with a
  // contractual consequence, so it cannot be raised without the number that
  // makes the consequence computable.
  if (input.type === "count_discrepancy" && (!input.discoveredLightCount || input.discoveredLightCount <= 0)) {
    return { error: "A count discrepancy needs the count actually found on site — it changes the represented count, and therefore every future bill." };
  }

  const blocker = await db.installationBlocker.create({
    data: {
      projectId: project.id,
      batchId: input.batchId || null,
      type: input.type,
      areaKey: input.areaKey.trim() || null,
      detail: input.detail.trim(),
      photoKeys: input.photoKeys,
      affectedDate: input.affectedDate ? new Date(`${input.affectedDate}T00:00:00.000Z`) : null,
      discoveredLightCount: input.discoveredLightCount,
      raisedById: session.user.id,
    },
  });

  logger.info("installation.blocker_raised", {
    actorId: session.user.id,
    pipelineId,
    blockerId: blocker.id,
    type: input.type,
    benchmarkAffecting: input.type === "count_discrepancy",
  });

  revalidatePath(pathFor(pipelineId));
  return { ok: true as const };
}

export async function resolveBlocker(pipelineId: string, blockerId: string, resolution: string) {
  const ops = await requireOps();
  if ("error" in ops) return ops;
  const { session } = ops;

  const blocker = await db.installationBlocker.findUnique({
    where: { id: blockerId },
    include: { project: true },
  });
  if (!blocker || blocker.project.pipelineId !== pipelineId) return { error: "Blocker not found." };
  if (blocker.status !== "open") return { error: "That blocker is already closed." };
  if (!resolution.trim()) return { error: "Record what was done." };

  // FEAT-036-AC-5 — a count discrepancy cannot be closed as a routine
  // operational note. It changes representedLightCount, which changes
  // extrapolation, which changes every future bill (CON-10), so it routes to
  // whoever owns the contract terms. There is deliberately no path from here
  // to a circuit's represented count: the two legitimate paths are a contract
  // amendment (FLOW-17, not built until R1) or the contract's own rescale
  // clause (FEAT-041), and both write their own audit row.
  if (blocker.type === "count_discrepancy") {
    logger.warn("installation.count_discrepancy_close_refused", { actorId: session.user.id, pipelineId, blockerId });
    return {
      error:
        "A count discrepancy cannot be closed here. It changes the represented count and therefore every future bill — it has to go through a contract amendment or the contract's own rescale clause, each of which records its own decision.",
    };
  }

  await db.installationBlocker.update({
    where: { id: blockerId },
    data: { status: "resolved", resolution: resolution.trim(), resolvedById: session.user.id, resolvedAt: new Date() },
  });

  logger.info("installation.blocker_resolved", { actorId: session.user.id, pipelineId, blockerId });
  revalidatePath(pathFor(pipelineId));
  return { ok: true as const };
}

export async function waiveBlocker(pipelineId: string, blockerId: string, reason: string) {
  const ops = await requireOps();
  if ("error" in ops) return ops;
  const { session } = ops;

  const blocker = await db.installationBlocker.findUnique({ where: { id: blockerId }, include: { project: true } });
  if (!blocker || blocker.project.pipelineId !== pipelineId) return { error: "Blocker not found." };
  if (blocker.status !== "open") return { error: "That blocker is already closed." };
  if (!reason.trim()) return { error: "A waiver needs a reason — it clears a gate that exists for a reason." };
  if (blocker.type === "count_discrepancy") {
    return { error: "A count discrepancy cannot be waived. Its consequence is contractual, not operational." };
  }

  await db.installationBlocker.update({
    where: { id: blockerId },
    data: { status: "waived", resolution: reason.trim(), resolvedById: session.user.id, resolvedAt: new Date() },
  });

  logger.warn("installation.blocker_waived", { actorId: session.user.id, pipelineId, blockerId });
  revalidatePath(pathFor(pipelineId));
  return { ok: true as const };
}

// ── FEAT-037 — completion certificate & billing start ────────────────────

export async function signCompletionCertificate(
  pipelineId: string,
  input: { signedAt: string; signatoryName: string; signatoryRole: string; signatureKey: string | null },
) {
  const ops = await requireOps();
  if ("error" in ops) return ops;
  const { session } = ops;

  const project = await db.installationProject.findUnique({
    where: { pipelineId },
    include: {
      batches: { include: { review: true } },
      blockers: true,
      plannedDays: true,
      certificate: true,
    },
  });
  if (!project) return { error: "No installation project for this deal." };
  if (project.certificate) return { error: "This project already has a signed completion certificate." };
  if (!input.signatoryName.trim() || !input.signatoryRole.trim()) {
    return { error: "Record who signed and in what capacity — the signature is the society's evidence, not a system action." };
  }

  const signedAt = new Date(`${input.signedAt}T00:00:00.000Z`);
  if (Number.isNaN(signedAt.getTime())) return { error: "Unreadable signature date." };

  const daysWithBatches = new Set(project.batches.map((b) => b.day)).size;
  const blocks = completionBlockers({
    batches: project.batches.map(toGateInput),
    openBlockerCount: project.blockers.filter((b) => b.status === "open").length,
    plannedDayCount: new Set(project.plannedDays.map((d) => d.day)).size,
    daysWithBatches,
  });
  if (blocks.length > 0) {
    logger.warn("installation.completion_refused", {
      actorId: session.user.id,
      pipelineId,
      reasons: blocks.map((b) => b.kind),
    });
    return { error: `Not ready to complete. ${blocks.map(describeCompletionBlocker).join(" ")}` };
  }

  const proration = prorateFirstMonth(signedAt);
  const totalInstalled = project.batches.reduce((n, b) => n + b.installedCount, 0);
  const waived = project.blockers.filter((b) => b.status === "waived");

  await db.$transaction(async (tx) => {
    await tx.completionCertificate.create({
      data: {
        projectId: project.id,
        signedAt,
        signatoryName: input.signatoryName.trim(),
        signatoryRole: input.signatoryRole.trim(),
        signatureKey: input.signatureKey,
        totalInstalledCount: totalInstalled,
        billingStartDate: proration.billingStart,
        proratedDays: proration.proratedDays,
        daysInMonth: proration.daysInMonth,
        waivedBlockerIds: waived.length > 0 ? waived.map((b) => b.id) : undefined,
        waiverReason: waived.length > 0 ? waived.map((b) => b.resolution).join(" | ") : null,
        recordedById: session.user.id,
      },
    });
    await tx.installationProject.update({ where: { id: project.id }, data: { state: "complete" } });
    await tx.pipeline.update({ where: { id: pipelineId }, data: { stage: "active_billing" } });
  });

  logger.info("installation.completed", {
    actorId: session.user.id,
    pipelineId,
    projectId: project.id,
    signedAt: signedAt.toISOString(),
    billingStartDate: proration.billingStart.toISOString(),
    proratedDays: proration.proratedDays,
    daysInMonth: proration.daysInMonth,
    totalInstalledCount: totalInstalled,
  });

  revalidatePath(pathFor(pipelineId));
  revalidatePath(`/admin/pipeline/${pipelineId}`);
  return { ok: true as const };
}

// Read-side helper for the setup form's onlooker picker — the society's own
// portal accounts, never anyone else's (INV-05).
export async function listSocietyPortalAccounts(societyId: string) {
  await requireAdmin();
  return db.profile.findMany({
    where: { societyId, isActive: true },
    select: { id: true, name: true, email: true, portalAuthority: true },
    orderBy: { name: "asc" },
  });
}
