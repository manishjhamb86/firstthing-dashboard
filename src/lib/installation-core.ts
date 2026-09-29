import type { BlockerType } from "@prisma/client";
import { db } from "@/lib/db";
import { demoBypass } from "@/lib/demo-mode";
import { logger } from "@/lib/logger";
import { startOfDayUTC } from "@/lib/step-dates";
import {
  completionBlockers,
  describeCompletionBlocker,
  evaluateDayGate,
  type BatchGateInput,
} from "@/lib/installation-gate";
import { prorateFirstMonth } from "@/lib/billing-start";
import { buildDocumentKey } from "@/lib/document-keys";
import type { Prisma } from "@prisma/client";

// The installation day's acts — start a day, submit its batch, raise a
// blocker, sign the completion certificate — shared by the back office's
// Server Actions and the field app's sync route (docs/engineering/19-field-app.md
// §15), so the phone is refused for exactly what the desk is.
//
// They take the ACCOUNT rather than reading the session: the sync route has
// already resolved it from the row, and a "use server" file would expose any
// helper it exported to the browser. Permission checks stay with the caller
// (field work is manage_survey; the certificate is the operations lead's).

export type Actor = { id: string };
export type CoreResult<T = object> = ({ ok: true } & T) | { error: string };

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

// ── FEAT-034 — daily batch logging ───────────────────────────────────────

export async function startBatchAs(actor: Actor, pipelineId: string, plannedDayId: string): Promise<CoreResult<{ batchId: string }>> {
  const day = await db.installationPlannedDay.findUnique({
    where: { id: plannedDayId },
    include: { project: { include: { batches: { include: { review: true } } } } },
  });
  if (!day || day.project.pipelineId !== pipelineId) return { error: "That planned day is not part of this project." };

  const existing = day.project.batches.find((b) => b.plannedDayId === plannedDayId);
  if (existing) return { ok: true, batchId: existing.id };

  // CON-21 reaches back into capture: a day that cannot start should not be
  // able to open a batch either, or the crew discovers the block on arrival —
  // which is precisely what FEAT-035-AC-3 exists to prevent.
  const previous = day.project.batches.filter((b) => b.day === day.day - 1).map(toGateInput);
  const gate = evaluateDayGate({
    ignoreDeadline: await demoBypass("installation_review_deadline", { plannedDayId: day.id }),
    previousBatches: previous,
    startAt: day.startAt,
    now: new Date(),
    skipUsedForDay: day.project.gateSkipBatchId
      ? day.project.batches.some((b) => b.id === day.project.gateSkipBatchId && b.day === day.day - 1)
      : false,
  });
  if (!gate.canStart) {
    logger.warn("installation.day_blocked", { actorId: actor.id, pipelineId, day: day.day, status: gate.status });
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
        participants: { create: { userId: actor.id, acceptedAt: new Date() } },
        areaClaims: { create: { areaKey: day.areaKey, claimedById: actor.id } },
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

  logger.info("installation.batch_started", { actorId: actor.id, pipelineId, batchId: batch.id, day: day.day });
  return { ok: true, batchId: batch.id };
}

export type BatchSubmitInput = {
  installedCount: number;
  removedFittingsCount: number;
  skippedCount: number;
  skippedReason: string;
  locationDetail: string;
  photoKeys: string[];
  /** Old records only: why there are no photos for a day already past. */
  photosWaivedReason?: string;
  /** The day the work was done (YYYY-MM-DD). Defaults to now. */
  workedOn?: string;
};

export async function submitBatchAs(actor: Actor, pipelineId: string, batchId: string, input: BatchSubmitInput): Promise<CoreResult> {
  // A day typed up after the fact is dated to the day it happened, not to
  // the moment it was entered (2026-09-27, user-caught).
  let submittedAt = new Date();
  if (input.workedOn) {
    const worked = new Date(`${input.workedOn}T00:00:00.000Z`);
    if (Number.isNaN(worked.getTime())) return { error: "Unreadable work date." };
    if (worked.getTime() > startOfDayUTC(new Date()).getTime()) return { error: "The work cannot be dated in the future." };
    if (input.workedOn !== new Date().toISOString().slice(0, 10)) submittedAt = worked;
  }

  const batch = await db.installationBatch.findUnique({
    where: { id: batchId },
    include: { project: true, fieldVisit: { include: { areaClaims: true } }, plannedDay: { select: { plannedDate: true } } },
  });
  if (!batch || batch.project.pipelineId !== pipelineId) return { error: "Batch not found." };
  if (batch.state !== "draft") return { error: "This batch has already been submitted." };

  // FEAT-034-AC-3 — photos are what make the society's review and any dispute
  // resolvable. Without them a dispute is one person's word against another's.
  // The one exception (user's call 2026-09-15, "skip for old records"): a day
  // already in the past, being typed up after the fact, may be submitted
  // without photos — with the reason stated on the batch, so a reviewer can
  // tell an old record from a day somebody forgot to photograph.
  const waived = input.photosWaivedReason?.trim() ?? "";
  if (input.photoKeys.length === 0) {
    const plannedDay = batch.plannedDay?.plannedDate ? startOfDayUTC(batch.plannedDay.plannedDate) : null;
    const today = startOfDayUTC(new Date());
    const isOld = plannedDay != null && plannedDay.getTime() < today.getTime();
    if (!isOld) {
      return { error: "Photo evidence is required. The society reviews this batch against the photos, and a dispute has to be checkable by someone standing in the building tomorrow." };
    }
    if (!waived) {
      logger.warn("installation.batch_submit_refused", { actorId: actor.id, pipelineId, batchId, reason: "no_photos_no_waiver" });
      return { error: "No photos for a past day — say why this record has none (e.g. recorded after the fact from the installation register)." };
    }
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
        photosWaivedReason: input.photoKeys.length === 0 ? waived : null,
        state: "awaiting_review",
        submittedById: actor.id,
        submittedAt,
      },
    });
    if (batch.fieldVisitId) {
      await tx.fieldVisit.update({ where: { id: batch.fieldVisitId }, data: { state: "submitted" } });
    }
  });

  // XS-06 — the onlooker is notified here. Real delivery is NFR-10/R1; the
  // log line is the audit trail this build commits to in the meantime.
  logger.info("installation.batch_submitted", {
    actorId: actor.id,
    pipelineId,
    batchId,
    photosWaived: input.photoKeys.length === 0,
    day: batch.day,
    areaKey: batch.areaKey,
    installedCount: input.installedCount,
    onlookerNotified: batch.project.onlookerId,
  });
  return { ok: true };
}

/**
 * The phone's one act for a day: open its batch (through the review gate,
 * judged when the work reaches the office) and submit it. A day already
 * started in the back office is submitted from where it stands.
 */
export async function recordDayAs(actor: Actor, pipelineId: string, plannedDayId: string, input: BatchSubmitInput): Promise<CoreResult<{ batchId: string }>> {
  const started = await startBatchAs(actor, pipelineId, plannedDayId);
  if ("error" in started) return started;
  const submitted = await submitBatchAs(actor, pipelineId, started.batchId, input);
  if ("error" in submitted) return submitted;
  return { ok: true, batchId: started.batchId };
}

// ── FEAT-036 — blockers ──────────────────────────────────────────────────

export type BlockerInput = {
  type: BlockerType;
  areaKey: string;
  detail: string;
  batchId: string | null;
  affectedDate: string | null;
  discoveredLightCount: number | null;
  photoKeys: string[];
};

export async function raiseBlockerAs(
  actor: Actor,
  pipelineId: string,
  input: BlockerInput,
  // One insert, so the field sync route can run it inside the transaction
  // that writes its receipt — a lost reply then cannot raise it twice.
  client: Prisma.TransactionClient = db,
): Promise<CoreResult<{ blockerId: string }>> {
  const project = await client.installationProject.findUnique({ where: { pipelineId } });
  if (!project) return { error: "No installation project for this deal." };
  if (!input.detail.trim()) return { error: "Describe the blocker — ops sees this, not the site." };

  // FEAT-036-AC-5 — a count discrepancy is the one blocker type with a
  // contractual consequence, so it cannot be raised without the number that
  // makes the consequence computable.
  if (input.type === "count_discrepancy" && (!input.discoveredLightCount || input.discoveredLightCount <= 0)) {
    return { error: "A count discrepancy needs the count actually found on site — it changes the represented count, and therefore every future bill." };
  }

  const blocker = await client.installationBlocker.create({
    data: {
      projectId: project.id,
      batchId: input.batchId || null,
      type: input.type,
      areaKey: input.areaKey.trim() || null,
      detail: input.detail.trim(),
      photoKeys: input.photoKeys,
      affectedDate: input.affectedDate ? new Date(`${input.affectedDate}T00:00:00.000Z`) : null,
      discoveredLightCount: input.discoveredLightCount,
      raisedById: actor.id,
    },
  });

  logger.info("installation.blocker_raised", {
    actorId: actor.id,
    pipelineId,
    blockerId: blocker.id,
    type: input.type,
    benchmarkAffecting: input.type === "count_discrepancy",
  });
  return { ok: true, blockerId: blocker.id };
}

// ── FEAT-037 — completion certificate & billing start ────────────────────

export type CertificateInput = { signedAt: string; signatoryName: string; signatoryRole: string; signatureKey: string | null };

/** The caller has already checked that the actor is the operations lead. */
export async function signCertificateAs(actor: Actor, pipelineId: string, input: CertificateInput): Promise<CoreResult> {
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
  if (signedAt.getTime() > startOfDayUTC(new Date()).getTime()) return { error: "The certificate cannot be dated in the future." };

  const daysWithBatches = new Set(project.batches.map((b) => b.day)).size;
  const blocks = completionBlockers({
    batches: project.batches.map(toGateInput),
    openBlockerCount: project.blockers.filter((b) => b.status === "open").length,
    plannedDayCount: new Set(project.plannedDays.map((d) => d.day)).size,
    daysWithBatches,
  });
  if (blocks.length > 0) {
    logger.warn("installation.completion_refused", {
      actorId: actor.id,
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
        recordedById: actor.id,
      },
    });
    await tx.installationProject.update({ where: { id: project.id }, data: { state: "complete" } });
    await tx.pipeline.update({ where: { id: pipelineId }, data: { stage: "active_billing" } });
  });

  logger.info("installation.completed", {
    actorId: actor.id,
    pipelineId,
    projectId: project.id,
    signedAt: signedAt.toISOString(),
    billingStartDate: proration.billingStart.toISOString(),
    proratedDays: proration.proratedDays,
    daysInMonth: proration.daysInMonth,
    totalInstalledCount: totalInstalled,
  });
  return { ok: true };
}

/** The most photos one day may carry from the phone. */
export const MAX_DAY_PHOTOS = 12;

/**
 * The S3 key of a day's Nth photo from the field app. Deterministic, so a
 * photo re-sent after a dropped connection overwrites its own object rather
 * than leaving a second one this app cannot delete; and checkable, so the
 * sync route accepts only keys it would itself have issued for that day.
 * The period is the planned day's month — the day the photo documents.
 */
export function batchPhotoKey(input: { societyName: string; plannedDate: Date; plannedDayId: string; index: number }): string {
  const day = input.plannedDate.toISOString().slice(0, 10);
  return buildDocumentKey({
    society: input.societyName,
    month: day.slice(0, 7),
    docType: "installationBatch",
    dateLabel: day,
    identifier: `${input.plannedDayId}-${input.index + 1}`,
    extension: "jpg",
  });
}
