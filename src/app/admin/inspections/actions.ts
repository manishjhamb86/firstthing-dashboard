"use server";

// The monthly inspection checklist — filing is field work (PER-03/PER-04,
// manage_survey, the same permission gate_pass submission, benchmark
// rescale entry and circuit replacement recording all use), voiding is
// operations only (the same asymmetry as circuit-void.ts). resolveAdmin() +
// typed errors throughout, not requireAdminPermission — that helper throws,
// which surfaces as an opaque production digest, a defect already found and
// fixed twice elsewhere in this codebase.
//
// Two acts, not one (2026-09-12, user-specified): `startInspection` claims
// the (society, area, period) slot and captures the header a visit opens
// with; `finalizeInspection` records the walk-through's own checklist and
// its two summary figures once the visit is actually done.

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { inspectionNow, presignInspectionEvidence } from "@/lib/inspection-file";
import { resolveAdmin } from "@/lib/admin-permissions";
import { isOperations } from "@/lib/admin-teams";
import { logger } from "@/lib/logger";
import {
  refuseDiscardDraft,
  refuseFindingLocation,
  refuseInspectionFinalize,
  refuseInspectionStart,
  refuseVoidInspection,
  findMatchingLocation,
  type FindingInput,
} from "@/lib/inspection";
import { circuitLabelOf } from "@/lib/meter-view";
import type { InspectionSensorStatus } from "@prisma/client";

function isUniqueConstraintViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

export type StartInspectionInput = {
  societyId: string;
  circuitId: string | null;
  area: string;
  period: string;
  inspectedAt: string; // "YYYY-MM-DDTHH:mm", a datetime-local value
};

/** What the form shows instead of a hard refusal, when the slot is already a live draft — Resume or Discard (2026-10-06, user-asked). */
export type ExistingDraft = {
  id: string;
  startedBy: string;
  findingsCount: number;
  distinctContributors: number;
  lastActivity: string | null;
  canDiscard: boolean;
};

export async function startInspection(
  input: StartInspectionInput,
): Promise<{ id: string } | { error: string } | { existingDraft: ExistingDraft }> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };
  if (!admin.permissions.includes("manage_survey")) {
    logger.warn("inspection.start_refused", { actorId: admin.id, reason: "permission" });
    return { error: "Filing an inspection is field work (Manage survey)." };
  }

  const society = await db.society.findUnique({ where: { id: input.societyId }, select: { id: true } });
  if (!society) return { error: "That society no longer exists." };

  let area = input.area.trim();
  if (input.circuitId) {
    const circuit = await db.circuit.findUnique({
      where: { id: input.circuitId },
      select: { societyId: true, location: true, lightType: true, voidedAt: true },
    });
    if (!circuit || circuit.societyId !== input.societyId || circuit.voidedAt) {
      return { error: "That circuit is not available for this society." };
    }
    area = circuitLabelOf(circuit.location, circuit.lightType);
  }

  // input.inspectedAt is an <input type="datetime-local"> value with no
  // timezone designator — parsing it bare is locale-dependent (a typed
  // "10:30" silently shifted to a different stored instant when this was
  // first built and verified). This codebase's own rule for "typed by a
  // person" fields is UTC, applied explicitly, same as every date-only
  // input's "T00:00:00Z".
  const inspectedAt = new Date(`${input.inspectedAt}:00Z`);

  // A voided inspection still holds the slot's unique key (society, area,
  // month) — inspection-file.ts's own fileInspection already says so and
  // refuses in these same words; this path hadn't implemented that half of
  // the rule, and the real unique index answered with a raw 500 instead
  // (user-caught 2026-10-06, found on RG Residency's own voided October slot).
  const existing = await db.inspection.findUnique({
    where: { societyId_area_period: { societyId: input.societyId, area, period: input.period } },
    select: {
      id: true,
      voidedAt: true,
      totalLightsChecked: true,
      createdBy: { select: { name: true, email: true } },
      findings: { select: { addedById: true, addedAt: true } },
    },
  });

  // A live DRAFT (started, not yet finalized) is not a hard stop — the
  // user's own ask: offer to resume it, or discard it and start fresh,
  // rather than refusing outright the way a FINALIZED or voided slot still
  // does below.
  if (existing && existing.voidedAt === null && existing.totalLightsChecked === null) {
    const distinctContributors = new Set(existing.findings.map((f) => f.addedById)).size;
    const lastActivity = existing.findings.reduce<Date | null>(
      (max, f) => (!max || f.addedAt > max ? f.addedAt : max),
      null,
    );
    return {
      existingDraft: {
        id: existing.id,
        startedBy: existing.createdBy.name ?? existing.createdBy.email,
        findingsCount: existing.findings.length,
        distinctContributors,
        lastActivity: lastActivity ? lastActivity.toISOString() : null,
        canDiscard: refuseDiscardDraft({ alreadyFinalized: false, alreadyVoided: false, distinctContributors }) === null,
      },
    };
  }

  // The inspector is the signed-in account, never retyped (2026-09-12,
  // user-specified: "its the user who has logged in"). No phone number is
  // stored on an AdminUser, so the account's own email stands in for
  // "contact" — the same field every other screen in this codebase already
  // shows for who did what.
  const inspectorName = admin.name ?? admin.email;
  const inspectorContact = admin.email;

  const refusal = refuseInspectionStart(
    { area, period: input.period, inspectedAt, inspectorName, inspectorContact },
    { now: inspectionNow(), existingActiveForSlot: existing !== null && existing.voidedAt === null },
  );
  if (refusal) {
    logger.warn("inspection.start_refused", { actorId: admin.id, societyId: input.societyId, reason: refusal });
    return { error: refusal };
  }
  if (existing) {
    logger.warn("inspection.start_refused", { actorId: admin.id, societyId: input.societyId, reason: "slot_voided" });
    return { error: "An inspection for this society, area and month was filed and then voided. That month's slot cannot be filed again." };
  }

  let created;
  try {
    created = await db.inspection.create({
      data: {
        societyId: input.societyId,
        circuitId: input.circuitId,
        area,
        period: input.period,
        inspectedAt,
        inspectorName,
        inspectorContact,
        createdById: admin.id,
      },
    });
  } catch (err) {
    // Belt-and-braces for a genuine race (two submissions landing together)
    // — the checks above should already have caught every other case.
    // same visit together, can both pass that check and then race each other
    // here. The unique index is what actually decides it; this just turns the
    // loser's raw constraint violation into the same words the pre-check
    // already uses, rather than an opaque production digest.
    if (isUniqueConstraintViolation(err)) {
      logger.warn("inspection.start_refused", { actorId: admin.id, societyId: input.societyId, reason: "race" });
      return { error: "An inspection already exists for this society, area and month — void it first, or continue the one already in progress." };
    }
    throw err;
  }

  logger.info("inspection.started", { actorId: admin.id, societyId: input.societyId, inspectionId: created.id });
  revalidatePath("/admin/inspections");
  revalidatePath(`/admin/inspections/${created.id}`);
  return { id: created.id };
}

/**
 * A photo of the signed, stamped paper form (2026-09-12) — a presigned PUT
 * under the same public `Documents/` tree every other filed document uses
 * (StoredDocument, KYC, agreements), so the resident portal can link to it
 * with no separate signed-GET plumbing. Refuses once the inspection is
 * already finalized or voided — same guard as `finalizeInspection` itself,
 * since this photo is only ever taken at the close of one specific visit.
 */
export async function getInspectionEvidenceUploadUrl(input: {
  inspectionId: string;
  fileName: string;
  contentType: string;
}): Promise<{ uploadUrl: string; key: string } | { error: string }> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };
  if (!admin.permissions.includes("manage_survey")) {
    return { error: "Filing an inspection is field work (Manage survey)." };
  }
  if (!input.contentType.startsWith("image/")) {
    return { error: "Only an image — a photo of the signed form — can be uploaded here." };
  }

  const inspection = await db.inspection.findUnique({
    where: { id: input.inspectionId },
    include: { society: { select: { name: true } } },
  });
  if (!inspection) return { error: "That inspection no longer exists." };
  if (inspection.voidedAt) return { error: "This inspection has been voided." };
  // A finalised inspection stays editable (user's call 2026-09-16), so the
  // signed-checklist photo can be added or replaced after the fact too.

  const { uploadUrl, key } = await presignInspectionEvidence({
    inspectionId: input.inspectionId,
    societyName: inspection.society.name,
    period: inspection.period,
    fileName: input.fileName,
    contentType: input.contentType,
  });
  logger.info("inspection.evidence_presigned", { actorId: admin.id, inspectionId: input.inspectionId, key });
  return { uploadUrl, key };
}

/**
 * The visit's close-out, now that its findings were already saved one at a
 * time as they were added (2026-10-06) rather than typed into one form and
 * submitted all at once — this no longer CREATES findings, it writes the
 * total/rep/notes/photo onto whatever findings already exist on the row.
 */
export type FinalizeInspectionInput = {
  id: string;
  totalLightsChecked: number;
  societyRepName: string;
  notes: string;
  evidencePhotoKey: string | null;
};

export async function finalizeInspection(
  input: FinalizeInspectionInput,
): Promise<{ error?: string }> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };
  if (!admin.permissions.includes("manage_survey")) {
    logger.warn("inspection.finalize_refused", { actorId: admin.id, inspectionId: input.id, reason: "permission" });
    return { error: "Filing an inspection is field work (Manage survey)." };
  }

  const inspection = await db.inspection.findUnique({
    where: { id: input.id },
    select: { voidedAt: true, totalLightsChecked: true, findings: { select: { id: true, srNo: true, location: true, sensorStatus: true, physicalDamage: true, actionReplace: true, remarks: true } } },
  });
  if (!inspection) return { error: "That inspection no longer exists." };
  if (inspection.voidedAt) return { error: "This inspection has been voided." };
  if (inspection.totalLightsChecked !== null) return { error: "This inspection is already finalised." };

  const findings: FindingInput[] = inspection.findings.map((f) => ({
    srNo: f.srNo,
    location: f.location,
    sensorStatus: f.sensorStatus,
    physicalDamage: f.physicalDamage,
    actionReplace: f.actionReplace,
    remarks: f.remarks ?? "",
  }));

  const refusal = refuseInspectionFinalize({ totalLightsChecked: input.totalLightsChecked, findings });
  if (refusal) {
    logger.warn("inspection.finalize_refused", { actorId: admin.id, inspectionId: input.id, reason: refusal });
    return { error: refusal };
  }

  await db.inspection.update({
    where: { id: input.id },
    data: {
      totalLightsChecked: input.totalLightsChecked,
      societyRepName: input.societyRepName.trim() || null,
      notes: input.notes.trim() || null,
      ...(input.evidencePhotoKey ? { evidencePhotoKey: input.evidencePhotoKey } : {}),
    },
  });

  logger.info("inspection.finalized", {
    actorId: admin.id,
    inspectionId: input.id,
    findingCount: findings.length,
  });
  revalidatePath("/admin/inspections");
  revalidatePath(`/admin/inspections/${input.id}`);
  return {};
}

/**
 * Started, then abandoned — scrap it and let the slot take a fresh start
 * (2026-10-06, user-asked). A soft delete, same shape as the ops-only void,
 * but gated differently: nothing has been filed off a draft yet, so this is
 * not an operations act — it's refused only once more than one person has
 * actually contributed to it (refuseDiscardDraft), which is the "no two
 * users cancelling each other's work" rule in the user's own words.
 */
export async function discardInspectionDraft(input: { id: string; reason: string }): Promise<{ error?: string }> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };
  if (!admin.permissions.includes("manage_survey")) {
    logger.warn("inspection.discard_refused", { actorId: admin.id, inspectionId: input.id, reason: "permission" });
    return { error: "Filing an inspection is field work (Manage survey)." };
  }
  if (input.reason.trim() === "") return { error: "Say why this draft is being discarded." };

  const inspection = await db.inspection.findUnique({
    where: { id: input.id },
    select: { voidedAt: true, totalLightsChecked: true, findings: { select: { addedById: true } } },
  });
  if (!inspection) return { error: "That inspection no longer exists." };

  const distinctContributors = new Set(inspection.findings.map((f) => f.addedById)).size;
  const refusal = refuseDiscardDraft({
    alreadyFinalized: inspection.totalLightsChecked !== null,
    alreadyVoided: inspection.voidedAt !== null,
    distinctContributors,
  });
  if (refusal) {
    logger.warn("inspection.discard_refused", { actorId: admin.id, inspectionId: input.id, reason: refusal });
    return { error: refusal };
  }

  await db.inspection.update({
    where: { id: input.id },
    data: { voidedAt: new Date(), voidedById: admin.id, voidReason: input.reason.trim() },
  });
  logger.info("inspection.discarded", { actorId: admin.id, inspectionId: input.id });
  revalidatePath("/admin/inspections");
  return {};
}

/**
 * Add one finding WHILE the visit is still in progress (2026-10-06,
 * user-asked) — saved the instant it's added, not batched until the walk is
 * declared done, so nothing is lost if the phone closes mid-visit and two
 * people on site can both add from their own accounts at once. No
 * total-vs-count ceiling here (the total isn't entered until the visit is
 * finished) — that check belongs to `finalizeInspection` alone.
 *
 * `warning` is the duplicate nudge: "there is no sure way of telling if it's
 * the same light" (the user's own words), so an exact location match never
 * blocks the save, it only names who else already logged that spot.
 */
export async function addDraftFinding(
  inspectionId: string,
  values: FindingValues,
): Promise<{ error: string } | { error?: undefined; id: string; warning?: string }> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };
  if (!admin.permissions.includes("manage_survey")) {
    logger.warn("inspection.draft_finding_refused", { actorId: admin.id, inspectionId, reason: "permission" });
    return { error: "Filing an inspection is field work (Manage survey)." };
  }
  const locationError = refuseFindingLocation(values.location);
  if (locationError) return { error: locationError };

  const inspection = await db.inspection.findUnique({
    where: { id: inspectionId },
    select: {
      voidedAt: true,
      totalLightsChecked: true,
      findings: { select: { id: true, srNo: true, location: true, addedById: true, addedBy: { select: { name: true, email: true } } } },
    },
  });
  if (!inspection) return { error: "That inspection no longer exists." };
  if (inspection.voidedAt) return { error: "This inspection has been voided." };
  if (inspection.totalLightsChecked !== null) return { error: "This visit has already been finished — add fixtures from the edit screen instead." };

  const match = findMatchingLocation(values.location, inspection.findings);
  const created = await db.inspectionFinding.create({
    data: {
      inspectionId,
      srNo: inspection.findings.length + 1,
      location: values.location.trim(),
      sensorStatus: values.sensorStatus,
      physicalDamage: values.physicalDamage,
      actionReplace: values.actionReplace,
      remarks: values.remarks.trim() || null,
      addedById: admin.id,
    },
  });
  logger.info("inspection.draft_finding_added", { actorId: admin.id, inspectionId, findingId: created.id, possibleDuplicateOf: match?.location ?? null });
  revalidatePath(`/admin/inspections/${inspectionId}`);
  return {
    id: created.id,
    warning: match
      ? `${match.addedBy.name ?? match.addedBy.email} already logged a fixture at "${match.location}" — if this is the same one, remove one of them so it isn't counted twice.`
      : undefined,
  };
}

/** Remove one fixture while the visit is still in progress — anyone on the draft, not only whoever added it. */
export async function removeDraftFinding(inspectionId: string, findingId: string): Promise<{ error?: string }> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };
  if (!admin.permissions.includes("manage_survey")) {
    logger.warn("inspection.draft_finding_remove_refused", { actorId: admin.id, inspectionId, reason: "permission" });
    return { error: "Filing an inspection is field work (Manage survey)." };
  }
  const inspection = await db.inspection.findUnique({
    where: { id: inspectionId },
    select: { voidedAt: true, totalLightsChecked: true, findings: { select: { id: true, srNo: true }, orderBy: { srNo: "asc" } } },
  });
  if (!inspection) return { error: "That inspection no longer exists." };
  if (inspection.voidedAt) return { error: "This inspection has been voided." };
  if (inspection.totalLightsChecked !== null) return { error: "This visit has already been finished — remove fixtures from the edit screen instead." };
  if (!inspection.findings.some((f) => f.id === findingId)) return { error: "That fixture is not on this inspection." };

  await db.$transaction(async (tx) => {
    await tx.inspectionFinding.delete({ where: { id: findingId } });
    const rest = inspection.findings.filter((f) => f.id !== findingId);
    for (const [i, f] of rest.entries()) {
      if (f.srNo !== i + 1) await tx.inspectionFinding.update({ where: { id: f.id }, data: { srNo: i + 1 } });
    }
  });
  logger.info("inspection.draft_finding_removed", { actorId: admin.id, inspectionId, findingId });
  revalidatePath(`/admin/inspections/${inspectionId}`);
  return {};
}

export async function voidInspection(input: { id: string; reason: string }): Promise<{ error?: string }> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };
  if (!isOperations(admin.team)) {
    logger.warn("inspection.void_refused", { actorId: admin.id, inspectionId: input.id, reason: "not-ops" });
    return { error: "Voiding a filed inspection is an operations action." };
  }

  const inspection = await db.inspection.findUnique({ where: { id: input.id }, select: { voidedAt: true } });
  if (!inspection) return { error: "That inspection no longer exists." };

  const refusal = refuseVoidInspection({ alreadyVoided: inspection.voidedAt !== null, reason: input.reason });
  if (refusal) {
    logger.warn("inspection.void_refused", { actorId: admin.id, inspectionId: input.id, reason: refusal });
    return { error: refusal };
  }

  await db.inspection.update({
    where: { id: input.id },
    data: { voidedAt: new Date(), voidedById: admin.id, voidReason: input.reason.trim() },
  });
  logger.info("inspection.voided", { actorId: admin.id, inspectionId: input.id });
  revalidatePath("/admin/inspections");
  revalidatePath(`/admin/inspections/${input.id}`);
  return {};
}

/**
 * Correct a finalised inspection in place (user's call 2026-09-16: "keep this
 * editable"). The same rules as finalising; the findings are replaced as a
 * set inside one transaction, so the record never holds half of each. Old
 * and new totals go to the log line; the photo is kept unless a new one was
 * uploaded.
 */
export type UpdateInspectionInput = FinalizeInspectionInput & {
  findings: {
    location: string;
    sensorStatus: InspectionSensorStatus;
    physicalDamage: boolean;
    actionReplace: boolean;
    remarks: string;
  }[];
};

export async function updateInspection(input: UpdateInspectionInput): Promise<{ error?: string }> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };
  if (!admin.permissions.includes("manage_survey")) {
    logger.warn("inspection.update_refused", { actorId: admin.id, inspectionId: input.id, reason: "permission" });
    return { error: "Correcting an inspection is field work (Manage survey)." };
  }
  const inspection = await db.inspection.findUnique({
    where: { id: input.id },
    select: { voidedAt: true, totalLightsChecked: true, findings: { select: { id: true } } },
  });
  if (!inspection) return { error: "That inspection no longer exists." };
  if (inspection.voidedAt) return { error: "This inspection has been voided." };
  if (inspection.totalLightsChecked === null) return { error: "This inspection has not been finalised yet — finish the visit first." };

  const findings: FindingInput[] = input.findings.map((f, i) => ({
    srNo: i + 1,
    location: f.location,
    sensorStatus: f.sensorStatus,
    physicalDamage: f.physicalDamage,
    actionReplace: f.actionReplace,
    remarks: f.remarks,
  }));
  const refusal = refuseInspectionFinalize({ totalLightsChecked: input.totalLightsChecked, findings });
  if (refusal) {
    logger.warn("inspection.update_refused", { actorId: admin.id, inspectionId: input.id, reason: refusal });
    return { error: refusal };
  }

  await db.$transaction(async (tx) => {
    await tx.inspectionFinding.deleteMany({ where: { inspectionId: input.id } });
    await tx.inspection.update({
      where: { id: input.id },
      data: {
        totalLightsChecked: input.totalLightsChecked,
        societyRepName: input.societyRepName.trim() || null,
        notes: input.notes.trim() || null,
        ...(input.evidencePhotoKey ? { evidencePhotoKey: input.evidencePhotoKey } : {}),
        findings: {
          create: findings.map((f) => ({
            srNo: f.srNo,
            location: f.location.trim(),
            sensorStatus: f.sensorStatus,
            physicalDamage: f.physicalDamage,
            actionReplace: f.actionReplace,
            remarks: f.remarks.trim() || null,
            addedById: admin.id,
          })),
        },
      },
    });
  });

  logger.info("inspection.updated", {
    actorId: admin.id,
    inspectionId: input.id,
    from: { totalLightsChecked: inspection.totalLightsChecked, findingCount: inspection.findings.length },
    to: { totalLightsChecked: input.totalLightsChecked, findingCount: findings.length },
  });
  revalidatePath("/admin/inspections");
  revalidatePath(`/admin/inspections/${input.id}`);
  return {};
}

export type FindingValues = {
  location: string;
  sensorStatus: InspectionSensorStatus;
  physicalDamage: boolean;
  actionReplace: boolean;
  remarks: string;
};

async function requireEditableInspection(inspectionId: string, act: string) {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." } as const;
  if (!admin.permissions.includes("manage_survey")) {
    logger.warn(`inspection.${act}_refused`, { actorId: admin.id, inspectionId, reason: "permission" });
    return { error: "Correcting an inspection is field work (Manage survey)." } as const;
  }
  const inspection = await db.inspection.findUnique({
    where: { id: inspectionId },
    select: { voidedAt: true, totalLightsChecked: true, findings: { select: { id: true, srNo: true }, orderBy: { srNo: "asc" } } },
  });
  if (!inspection) return { error: "That inspection no longer exists." } as const;
  if (inspection.voidedAt) return { error: "This inspection has been voided." } as const;
  if (inspection.totalLightsChecked === null) return { error: "This inspection has not been finalised yet — finish the visit first." } as const;
  return { admin, inspection } as const;
}

/**
 * Correct ONE fixture on a finalised inspection, or add one (user's call
 * 2026-09-16: "editing should be both line-item wise and the whole form").
 * `findingId` null adds a new row at the end. The total-lights rule still
 * holds — a fixture cannot be added past the total checked.
 */
export async function saveInspectionFinding(
  inspectionId: string,
  findingId: string | null,
  values: FindingValues,
): Promise<{ error?: string }> {
  const gate = await requireEditableInspection(inspectionId, "finding_save");
  if ("error" in gate) return { error: gate.error };
  const { admin, inspection } = gate;
  const locationError = refuseFindingLocation(values.location);
  if (locationError) {
    logger.warn("inspection.finding_save_refused", { actorId: admin.id, inspectionId, findingId, reason: "no_location" });
    return { error: locationError };
  }
  const data = {
    location: values.location.trim(),
    sensorStatus: values.sensorStatus,
    physicalDamage: values.physicalDamage,
    actionReplace: values.actionReplace,
    remarks: values.remarks.trim() || null,
  };
  if (findingId) {
    if (!inspection.findings.some((f) => f.id === findingId)) return { error: "That fixture is not on this inspection." };
    await db.inspectionFinding.update({ where: { id: findingId }, data });
  } else {
    if (inspection.findings.length + 1 > (inspection.totalLightsChecked ?? 0)) {
      return { error: "Total lights checked cannot be less than the number of fixtures listed — raise the total first." };
    }
    await db.inspectionFinding.create({ data: { ...data, inspectionId, srNo: inspection.findings.length + 1, addedById: admin.id } });
  }
  logger.info("inspection.finding_saved", { actorId: admin.id, inspectionId, findingId, created: !findingId });
  revalidatePath(`/admin/inspections/${inspectionId}`);
  revalidatePath("/admin/inspections");
  return {};
}

/** Remove one fixture from a finalised inspection; the rest are renumbered so Sr stays contiguous. */
export async function removeInspectionFinding(inspectionId: string, findingId: string): Promise<{ error?: string }> {
  const gate = await requireEditableInspection(inspectionId, "finding_remove");
  if ("error" in gate) return { error: gate.error };
  const { admin, inspection } = gate;
  if (!inspection.findings.some((f) => f.id === findingId)) return { error: "That fixture is not on this inspection." };
  await db.$transaction(async (tx) => {
    await tx.inspectionFinding.delete({ where: { id: findingId } });
    const rest = inspection.findings.filter((f) => f.id !== findingId);
    for (const [i, f] of rest.entries()) {
      if (f.srNo !== i + 1) await tx.inspectionFinding.update({ where: { id: f.id }, data: { srNo: i + 1 } });
    }
  });
  logger.info("inspection.finding_removed", { actorId: admin.id, inspectionId, findingId });
  revalidatePath(`/admin/inspections/${inspectionId}`);
  revalidatePath("/admin/inspections");
  return {};
}
