"use server";

import { revalidatePath } from "next/cache";
import { notifyInstallationDays } from "@/lib/push-notify";
import { db } from "@/lib/db";
import { demoBypass, isDemoMode } from "@/lib/demo-mode";
import { requireAdmin, requireAdminPermission, resolveAdmin } from "@/lib/admin-permissions";
import { logChange } from "@/lib/change-log";
import { keptAtDemoOf } from "@/lib/circuit-load";
import { refuseDateCorrector, refuseInstallationDates } from "@/lib/installation-dates";
import { projectCircuitMonitoring } from "@/lib/monitoring-projection";
import { rederiveInvoiceMonthsAfterRescale } from "@/lib/invoice-rederive";
import { logger } from "@/lib/logger";
import { startOfDayUTC } from "@/lib/step-dates";
import {
  evaluateDayGate,
  refuseGateSkip,
  SKIP_REFUSAL_MESSAGE,
  type BatchGateInput,
} from "@/lib/installation-gate";
import { prorateFirstMonth } from "@/lib/billing-start";
import {
  raiseBlockerAs,
  signCertificateAs,
  startBatchAs,
  submitBatchAs,
  type BatchSubmitInput,
  type BlockerInput,
  type CertificateInput,
} from "@/lib/installation-core";

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
      siteSurvey: { include: { areas: { where: { voidedAt: null } } } },
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
    return { error: "Name the society's onlooker. The daily review gate cannot run without one, and a day nobody reviews is a day that cannot complete." };
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

  // Who held a day before this publish — a replan must not re-notify them.
  const before = new Set(
    (
      await db.installationPlannedDay.findMany({
        where: { project: { pipelineId }, assignedToId: { not: null } },
        select: { assignedToId: true },
      })
    ).map((d) => d.assignedToId as string),
  );

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

  const after = new Map<string, Date>();
  for (const d of dayRows) {
    if (!d.assignedToId) continue;
    const seen = after.get(d.assignedToId);
    if (!seen || d.plannedDate < seen) after.set(d.assignedToId, d.plannedDate);
  }
  await notifyInstallationDays({ pipelineId, before, after, byId: session.user.id });

  revalidatePath(pathFor(pipelineId));
  return { ok: true as const };
}

// ── FEAT-034 — daily batch logging ───────────────────────────────────────

export async function startBatch(pipelineId: string, plannedDayId: string) {
  const session = await requireField();
  const r = await startBatchAs({ id: session.user.id }, pipelineId, plannedDayId);
  if ("error" in r) return { error: r.error };
  revalidatePath(pathFor(pipelineId));
  return { ok: true as const, batchId: r.batchId };
}

export async function submitBatch(pipelineId: string, batchId: string, input: BatchSubmitInput) {
  const session = await requireField();
  const r = await submitBatchAs({ id: session.user.id }, pipelineId, batchId, input);
  if ("error" in r) return { error: r.error };
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
    ignoreDeadline: await demoBypass("installation_review_deadline", { plannedDayId: day.id }),
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

export async function raiseBlocker(pipelineId: string, input: BlockerInput) {
  const session = await requireField();
  const r = await raiseBlockerAs({ id: session.user.id }, pipelineId, input);
  if ("error" in r) return { error: r.error };
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

export async function signCompletionCertificate(pipelineId: string, input: CertificateInput) {
  const ops = await requireOps();
  if ("error" in ops) return { error: ops.error };
  const r = await signCertificateAs({ id: ops.session.user.id }, pipelineId, input);
  if ("error" in r) return { error: r.error };
  revalidatePath(pathFor(pipelineId));
  revalidatePath(`/admin/pipeline/${pipelineId}`);
  return { ok: true as const };
}

// ── Date corrections (2026-09-27, user-asked) ────────────────────────────
//
// Batch and certificate dates were stamped at the moment of entry with no way
// back. In demo mode anyone doing the data entry may correct them; once live,
// operations only, with a reason. Every old value goes to the change log.

async function dateCorrector(reason: string, pipelineId: string, what: string) {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session has ended. Sign in again." as const };
  const perms = admin.permissions;
  const refusal = refuseDateCorrector({
    demo: await isDemoMode(),
    isField: perms.includes("manage_survey"),
    isOps: perms.includes("manage_survey") && perms.includes("manage_pipeline"),
    reason,
  });
  if (refusal) {
    logger.warn("installation.date_correction_refused", { actorId: admin.id, pipelineId, what, refusal });
    return { error: refusal };
  }
  return { actorId: admin.id };
}

function parseDay(s: string | undefined, label: string): Date | { error: string } | undefined {
  if (!s) return undefined;
  const v = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(v.getTime()) ? { error: `Unreadable ${label}.` } : v;
}

async function loadDates(pipelineId: string) {
  return db.installationProject.findUnique({
    where: { pipelineId },
    include: { batches: { include: { review: true } }, certificate: true },
  });
}

export async function correctBatchDates(
  pipelineId: string,
  batchId: string,
  input: { workedOn?: string; approvedOn?: string; reason: string },
) {
  const who = await dateCorrector(input.reason, pipelineId, "batch");
  if ("error" in who) return who;

  const project = await loadDates(pipelineId);
  const batch = project?.batches.find((b) => b.id === batchId);
  if (!project || !batch) return { error: "Batch not found." };
  if (!batch.submittedAt) return { error: "This day has not been submitted yet — its date is set when it is." };

  const worked = parseDay(input.workedOn, "work date");
  const approved = parseDay(input.approvedOn, "approval date");
  if (worked && "error" in worked) return worked;
  if (approved && "error" in approved) return approved;
  if (approved && !batch.review) return { error: "This day has not been reviewed by the society yet." };

  const newWorked = worked ?? batch.submittedAt;
  const newApproved = approved ?? batch.review?.reviewedAt ?? null;
  const refusal = refuseInstallationDates({
    today: new Date(),
    batches: project.batches.map((b) =>
      b.id === batchId
        ? { day: b.day, submittedOn: newWorked, reviewedOn: newApproved }
        : { day: b.day, submittedOn: b.submittedAt, reviewedOn: b.review?.reviewedAt ?? null },
    ),
    signedOn: project.certificate?.signedAt ?? null,
  });
  if (refusal) {
    logger.warn("installation.date_correction_refused", { actorId: who.actorId, pipelineId, batchId, refusal });
    return { error: refusal };
  }

  await db.$transaction(async (tx) => {
    if (worked && worked.getTime() !== batch.submittedAt!.getTime()) {
      await tx.installationBatch.update({ where: { id: batchId }, data: { submittedAt: worked } });
      await logChange(tx, {
        entity: "installation_batch", entityId: batchId, kind: "edit", field: "submittedAt",
        oldValue: batch.submittedAt, newValue: worked, reason: input.reason.trim() || null, actorId: who.actorId,
      });
    }
    if (approved && batch.review && approved.getTime() !== batch.review.reviewedAt.getTime()) {
      await tx.batchReview.update({ where: { id: batch.review.id }, data: { reviewedAt: approved } });
      await logChange(tx, {
        entity: "batch_review", entityId: batch.review.id, kind: "edit", field: "reviewedAt",
        oldValue: batch.review.reviewedAt, newValue: approved, reason: input.reason.trim() || null, actorId: who.actorId,
      });
    }
  });

  logger.info("installation.batch_dates_corrected", {
    actorId: who.actorId, pipelineId, batchId,
    workedOn: newWorked.toISOString(), approvedOn: newApproved?.toISOString() ?? null,
  });
  revalidatePath(pathFor(pipelineId));
  return { ok: true as const };
}

/**
 * Correct a day's own PLANNED date — the schedule itself, set at project
 * setup — not the day's actual work date (correctBatchDates, above, is for
 * that, and only applies once the day has been submitted). A day planned for
 * the wrong date blocks real work: the "recorded after the fact, no photos"
 * waiver only applies once a day's planned date has already passed, so a
 * typo that leaves a day planned for the future when the crew is really
 * there today makes it impossible to record without photos nobody took
 * (user-caught, 2026-10-02 — "allow to edit, that's incorrect").
 */
export async function correctPlannedDayDate(
  pipelineId: string,
  plannedDayId: string,
  input: { plannedDate: string; startTime?: string; reason: string },
) {
  const who = await dateCorrector(input.reason, pipelineId, "planned_day");
  if ("error" in who) return who;

  const day = await db.installationPlannedDay.findUnique({
    where: { id: plannedDayId },
    include: { project: { select: { pipelineId: true } }, batches: { select: { id: true, submittedAt: true } } },
  });
  if (!day || day.project.pipelineId !== pipelineId) return { error: "That planned day is no longer on record." };
  if (day.batches.some((b) => b.submittedAt)) {
    return { error: "This day has already been submitted — correct its work date instead of the plan." };
  }

  const newDate = parseDay(input.plannedDate, "planned date");
  if (newDate && "error" in newDate) return newDate;
  if (!newDate) return { error: "Pick a date." };

  const time = input.startTime?.trim() || "09:00";
  const newStartAt = new Date(`${input.plannedDate}T${time}:00.000Z`);
  if (Number.isNaN(newStartAt.getTime())) return { error: "Unreadable start time." };

  await db.$transaction(async (tx) => {
    await tx.installationPlannedDay.update({ where: { id: plannedDayId }, data: { plannedDate: newDate, startAt: newStartAt } });
    await logChange(tx, {
      entity: "installation_planned_day", entityId: plannedDayId, kind: "edit", field: "plannedDate",
      oldValue: day.plannedDate, newValue: newDate, reason: input.reason.trim() || null, actorId: who.actorId,
    });
  });

  logger.info("installation.planned_date_corrected", { actorId: who.actorId, pipelineId, plannedDayId, plannedDate: newDate.toISOString() });
  revalidatePath(pathFor(pipelineId));
  return { ok: true as const };
}

/**
 * Remove a planned day that was set up wrong (2026-10-02, user-asked:
 * "also allow to delete a row and reenter again"). Only ever a row nobody has
 * submitted work against yet — once a batch is submitted, the day IS the
 * record of what happened, same guard as correctPlannedDayDate. A hard
 * delete, not a void: nothing downstream (a reading, a payment) can yet rest
 * on an un-submitted planned day, so there is nothing a struck-through row
 * would be preserving.
 */
export async function deletePlannedDay(pipelineId: string, plannedDayId: string, reason: string) {
  const who = await dateCorrector(reason, pipelineId, "planned_day");
  if ("error" in who) return who;

  const day = await db.installationPlannedDay.findUnique({
    where: { id: plannedDayId },
    include: { project: { select: { pipelineId: true } }, batches: { select: { id: true, submittedAt: true } } },
  });
  if (!day || day.project.pipelineId !== pipelineId) return { error: "That planned day is no longer on record." };
  if (day.batches.some((b) => b.submittedAt)) {
    return { error: "This day has already been submitted — it is the record of what happened, not a plan to delete." };
  }

  await db.$transaction(async (tx) => {
    // Batches, Field visits (SetNull on both) survive — only ever reachable
    // here because neither has been submitted/logged against this day.
    await tx.installationPlannedDay.delete({ where: { id: plannedDayId } });
    await logChange(tx, {
      entity: "installation_planned_day", entityId: plannedDayId, kind: "edit", field: "deleted",
      oldValue: { day: day.day, areaKey: day.areaKey, plannedDate: day.plannedDate }, newValue: null,
      reason: reason.trim() || null, actorId: who.actorId,
    });
  });

  logger.info("installation.planned_day_deleted", { actorId: who.actorId, pipelineId, plannedDayId, day: day.day, areaKey: day.areaKey });
  revalidatePath(pathFor(pipelineId));
  return { ok: true as const };
}

/** Re-enter a day the same way setup itself creates one — day/area/date/count, matching `PlannedDayInput`. */
export async function addPlannedDay(pipelineId: string, input: PlannedDayInput & { reason: string }) {
  const who = await dateCorrector(input.reason, pipelineId, "planned_day");
  if ("error" in who) return who;

  const project = await db.installationProject.findUnique({ where: { pipelineId }, select: { id: true } });
  if (!project) return { error: "No installation project is set up for this deal yet." };

  const areaKey = input.areaKey.trim();
  if (!areaKey) return { error: "Every planned day needs an area." };
  if (!Number.isInteger(input.day) || input.day < 1) return { error: "Day must be a positive whole number." };
  if (!Number.isInteger(input.plannedCount) || input.plannedCount <= 0) return { error: "Planned count must be a positive whole number." };

  const startAt = new Date(`${input.plannedDate}T${input.startTime || "09:00"}:00.000Z`);
  if (Number.isNaN(startAt.getTime())) return { error: "Unreadable date or start time." };
  const plannedDate = new Date(`${input.plannedDate}T00:00:00.000Z`);
  if (Number.isNaN(plannedDate.getTime())) return { error: "Unreadable date." };

  const existing = await db.installationPlannedDay.findUnique({
    where: { projectId_day_areaKey: { projectId: project.id, day: input.day, areaKey } },
    select: { id: true },
  });
  if (existing) return { error: `Day ${input.day} already has a planned entry for ${areaKey} — delete it first, or pick a different day number.` };

  const created = await db.$transaction(async (tx) => {
    const row = await tx.installationPlannedDay.create({
      data: {
        projectId: project.id,
        day: input.day,
        plannedDate,
        startAt,
        areaKey,
        plannedCount: input.plannedCount,
        assignedToId: input.assignedToId || null,
      },
    });
    await logChange(tx, {
      entity: "installation_planned_day", entityId: row.id, kind: "edit", field: "created",
      oldValue: null, newValue: { day: row.day, areaKey: row.areaKey, plannedDate: row.plannedDate, plannedCount: row.plannedCount },
      reason: input.reason.trim() || null, actorId: who.actorId,
    });
    return row;
  });

  logger.info("installation.planned_day_added", { actorId: who.actorId, pipelineId, plannedDayId: created.id, day: created.day, areaKey: created.areaKey });
  revalidatePath(pathFor(pipelineId));
  return { ok: true as const, plannedDayId: created.id };
}

/**
 * Correct the certificate's signature date together with any day's work and
 * approval dates, checked ONCE against the result (2026-09-27, user-caught on
 * Arihant Arden). Correcting them one at a time deadlocked: a certificate
 * recorded before the ordering rule existed sat before its own day, so the day
 * could not move past the certificate and the certificate could not move past
 * the day. Saved in one transaction; the billing start follows the signature.
 */
export async function correctCertificateDate(
  pipelineId: string,
  input: { signedOn: string; reason: string; batches?: { batchId: string; workedOn?: string; approvedOn?: string }[] },
) {
  const who = await dateCorrector(input.reason, pipelineId, "certificate");
  if ("error" in who) return who;

  const project = await loadDates(pipelineId);
  const cert = project?.certificate;
  if (!project || !cert) return { error: "There is no completion certificate to correct." };

  const signed = parseDay(input.signedOn, "signature date");
  if (!signed) return { error: "Choose the date the certificate was signed." };
  if ("error" in signed) return signed;

  // The days as they will be after this correction.
  const edits = new Map((input.batches ?? []).map((b) => [b.batchId, b]));
  const next: { id: string; day: number; reviewId: string | null; submittedOn: Date | null; reviewedOn: Date | null; oldSubmitted: Date | null; oldReviewed: Date | null }[] = [];
  for (const b of project.batches) {
    const e = edits.get(b.id);
    const worked = e ? parseDay(e.workedOn, `day ${b.day}'s work date`) : undefined;
    const approved = e ? parseDay(e.approvedOn, `day ${b.day}'s approval date`) : undefined;
    if (worked && "error" in worked) return worked;
    if (approved && "error" in approved) return approved;
    if (worked && !b.submittedAt) return { error: `Day ${b.day} has not been submitted yet — its date is set when it is.` };
    if (approved && !b.review) return { error: `Day ${b.day} has not been reviewed by the society yet.` };
    next.push({
      id: b.id,
      day: b.day,
      reviewId: b.review?.id ?? null,
      submittedOn: worked ?? b.submittedAt,
      reviewedOn: approved ?? b.review?.reviewedAt ?? null,
      oldSubmitted: b.submittedAt,
      oldReviewed: b.review?.reviewedAt ?? null,
    });
  }
  const certMoves = signed.getTime() !== startOfDayUTC(cert.signedAt).getTime();
  const dayMoves = next.some(
    (b) => b.submittedOn?.getTime() !== b.oldSubmitted?.getTime() || b.reviewedOn?.getTime() !== b.oldReviewed?.getTime(),
  );
  if (!certMoves && !dayMoves) return { error: "Nothing has changed." };

  const refusal = refuseInstallationDates({
    today: new Date(),
    batches: next.map((b) => ({ day: b.day, submittedOn: b.submittedOn, reviewedOn: b.reviewedOn })),
    signedOn: signed,
  });
  if (refusal) {
    logger.warn("installation.date_correction_refused", { actorId: who.actorId, pipelineId, refusal });
    return { error: refusal };
  }

  const proration = prorateFirstMonth(signed);
  const oldStart = cert.billingStartDate;
  const month = (x: Date) => x.toISOString().slice(0, 7);

  const circuits = await db.circuit.findMany({
    where: { siteSurvey: { pipelineId }, voidedAt: null },
    select: { id: true },
  });

  // Moving billing start LATER would unbill months already released to the
  // society (GATE-02). Moving it earlier never touches a released figure: the
  // months it adds are re-derived as new versions, not rewritten.
  if (certMoves && proration.billingStart.getTime() > oldStart.getTime() && circuits.length > 0) {
    const released = await db.circuitFeeLine.findFirst({
      where: {
        circuitId: { in: circuits.map((c) => c.id) },
        calculation: { status: "released", supersededById: null, period: { gte: month(oldStart), lt: month(proration.billingStart) } },
      },
      select: { calculation: { select: { period: true } } },
    });
    if (released) {
      return {
        error: `${released.calculation.period} has already been billed and released to the society. Billing cannot start after a month it was already billed for.`,
      };
    }
  }

  const reason = input.reason.trim() || null;
  await db.$transaction(async (tx) => {
    for (const b of next) {
      if (b.submittedOn && b.submittedOn.getTime() !== b.oldSubmitted?.getTime()) {
        await tx.installationBatch.update({ where: { id: b.id }, data: { submittedAt: b.submittedOn } });
        await logChange(tx, { entity: "installation_batch", entityId: b.id, kind: "edit", field: "submittedAt", oldValue: b.oldSubmitted, newValue: b.submittedOn, reason, actorId: who.actorId });
      }
      if (b.reviewId && b.reviewedOn && b.reviewedOn.getTime() !== b.oldReviewed?.getTime()) {
        await tx.batchReview.update({ where: { id: b.reviewId }, data: { reviewedAt: b.reviewedOn } });
        await logChange(tx, { entity: "batch_review", entityId: b.reviewId, kind: "edit", field: "reviewedAt", oldValue: b.oldReviewed, newValue: b.reviewedOn, reason, actorId: who.actorId });
      }
    }
    if (certMoves) {
      await tx.completionCertificate.update({
        where: { id: cert.id },
        data: { signedAt: signed, billingStartDate: proration.billingStart, proratedDays: proration.proratedDays, daysInMonth: proration.daysInMonth },
      });
      await logChange(tx, {
        entity: "completion_certificate", entityId: cert.id, kind: "edit", field: "signedAt",
        oldValue: { signedAt: cert.signedAt, billingStartDate: oldStart },
        newValue: { signedAt: signed, billingStartDate: proration.billingStart },
        reason, actorId: who.actorId,
      });
    }
  });

  // Monitoring runs from the billing start, and published months prorate on
  // it — both follow the corrected date.
  if (certMoves) {
    const fromPeriod = month(oldStart < proration.billingStart ? oldStart : proration.billingStart);
    for (const c of circuits) {
      try {
        await projectCircuitMonitoring(c.id, who.actorId);
        await rederiveInvoiceMonthsAfterRescale(c.id, fromPeriod, who.actorId);
      } catch (err) {
        logger.error("installation.certificate_followup_failed", { pipelineId, circuitId: c.id, error: String(err) });
      }
    }
  }

  logger.info("installation.dates_corrected", {
    actorId: who.actorId, pipelineId,
    certificate: certMoves ? { from: cert.signedAt.toISOString(), to: signed.toISOString(), billingStartDate: proration.billingStart.toISOString() } : null,
    days: next.filter((b) => b.submittedOn?.getTime() !== b.oldSubmitted?.getTime() || b.reviewedOn?.getTime() !== b.oldReviewed?.getTime()).map((b) => b.day),
  });
  revalidatePath(pathFor(pipelineId));
  revalidatePath(`/admin/pipeline/${pipelineId}`);
  revalidatePath("/portal");
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

// ── Fixtures kept during the demo, recorded at the full installation ─────
//
// 2026-09-27, user-specified: the demo's deduction for kept fixtures holds for
// the demo only. At the full installation each kept line is recorded — still
// on the circuit? if so, how many were replaced with energy-saving lights —
// and from the billing start the monitoring figures read that: replaced ones
// are not deducted, ones taken off the circuit come off the before side only,
// the rest stay deducted as before. The demo's own figures never change.

export async function recordKeptOutcome(
  pipelineId: string,
  input: { lines: { deviceId: string; stillOnCircuit: boolean; replacedCount: number }[]; reason: string },
) {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session has ended. Sign in again." };
  const perms = admin.permissions;
  const isField = perms.includes("manage_survey");
  const isOps = isField && perms.includes("manage_pipeline");
  if (!isField) return { error: "Recording what became of the kept fixtures is field or operations work." };

  const ids = input.lines.map((l) => l.deviceId);
  const devices = await db.circuitDevice.findMany({
    where: { id: { in: ids }, circuit: { voidedAt: null, siteSurvey: { pipelineId } } },
    select: {
      id: true,
      circuitId: true,
      count: true,
      excludedFromCalculation: true,
      replacementCount: true,
      keptReplacedCount: true,
      keptRemovedCount: true,
      keptRecordedAt: true,
    },
  });
  if (devices.length !== ids.length) return { error: "A fixture line was not found on this deal's circuits." };

  // A first recording is data entry. Changing one already recorded is a
  // correction: free in demo mode, operations with a reason once live.
  if (devices.some((d) => d.keptRecordedAt)) {
    const refusal = refuseDateCorrector({ demo: await isDemoMode(), isField, isOps, reason: input.reason });
    if (refusal) {
      logger.warn("installation.kept_outcome_refused", { actorId: admin.id, pipelineId, refusal });
      return { error: refusal.replace("installation dates are", "a recorded outcome is").replace("the date is", "it is") };
    }
  }

  const byId = new Map(devices.map((d) => [d.id, d]));
  const writes: { id: string; circuitId: string; replaced: number; removed: number; old: { replaced: number | null; removed: number | null } }[] = [];
  for (const l of input.lines) {
    const d = byId.get(l.deviceId)!;
    const kept = keptAtDemoOf(d);
    if (kept <= 0) return { error: "That line kept no fixtures at the demo." };
    const replaced = l.stillOnCircuit ? l.replacedCount : 0;
    if (!Number.isInteger(replaced) || replaced < 0 || replaced > kept) {
      return { error: `Replaced must be a whole number from 0 to the ${kept} kept.` };
    }
    writes.push({
      id: d.id,
      circuitId: d.circuitId,
      replaced,
      removed: l.stillOnCircuit ? 0 : kept,
      old: { replaced: d.keptReplacedCount, removed: d.keptRemovedCount },
    });
  }

  const now = new Date();
  await db.$transaction(async (tx) => {
    for (const w of writes) {
      await tx.circuitDevice.update({
        where: { id: w.id },
        data: { keptReplacedCount: w.replaced, keptRemovedCount: w.removed, keptRecordedAt: now, keptRecordedById: admin.id },
      });
      await logChange(tx, {
        entity: "circuit_device",
        entityId: w.id,
        circuitId: w.circuitId,
        kind: "edit",
        field: "keptOutcome",
        oldValue: w.old,
        newValue: { replaced: w.replaced, removed: w.removed },
        reason: input.reason.trim() || null,
        actorId: admin.id,
      });
    }
  });

  // Every monitoring figure reads the outcome: re-project the days' flags and
  // re-derive published months from the billing start.
  const project = await db.installationProject.findUnique({
    where: { pipelineId },
    select: { certificate: { select: { billingStartDate: true } } },
  });
  const fromPeriod = project?.certificate?.billingStartDate.toISOString().slice(0, 7) ?? "2000-01";
  for (const circuitId of new Set(writes.map((w) => w.circuitId))) {
    try {
      await projectCircuitMonitoring(circuitId, admin.id);
      await rederiveInvoiceMonthsAfterRescale(circuitId, fromPeriod, admin.id);
    } catch (err) {
      logger.error("installation.kept_outcome_followup_failed", { pipelineId, circuitId, error: String(err) });
    }
  }

  logger.info("installation.kept_outcome_recorded", {
    actorId: admin.id,
    pipelineId,
    lines: writes.map((w) => ({ deviceId: w.id, replaced: w.replaced, removed: w.removed })),
  });
  revalidatePath(pathFor(pipelineId));
  revalidatePath("/portal");
  revalidatePath("/portal/electricity");
  return { ok: true as const };
}
