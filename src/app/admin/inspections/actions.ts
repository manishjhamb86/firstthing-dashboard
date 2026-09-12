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
import { resolveAdmin } from "@/lib/admin-permissions";
import { isOperations } from "@/lib/admin-teams";
import { logger } from "@/lib/logger";
import {
  refuseInspectionFinalize,
  refuseInspectionStart,
  refuseVoidInspection,
  type FindingInput,
} from "@/lib/inspection";
import { circuitLabelOf } from "@/lib/meter-view";
import type { InspectionSensorStatus } from "@prisma/client";

export type StartInspectionInput = {
  societyId: string;
  circuitId: string | null;
  area: string;
  period: string;
  inspectedAt: string; // "YYYY-MM-DDTHH:mm", a datetime-local value
};

export async function startInspection(
  input: StartInspectionInput,
): Promise<{ id: string } | { error: string }> {
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

  const existing = await db.inspection.findUnique({
    where: { societyId_area_period: { societyId: input.societyId, area, period: input.period } },
    select: { voidedAt: true },
  });

  // The inspector is the signed-in account, never retyped (2026-09-12,
  // user-specified: "its the user who has logged in"). No phone number is
  // stored on an AdminUser, so the account's own email stands in for
  // "contact" — the same field every other screen in this codebase already
  // shows for who did what.
  const inspectorName = admin.name ?? admin.email;
  const inspectorContact = admin.email;

  const refusal = refuseInspectionStart(
    { area, period: input.period, inspectedAt, inspectorName, inspectorContact },
    { now: new Date(), existingActiveForSlot: existing !== null && existing.voidedAt === null },
  );
  if (refusal) {
    logger.warn("inspection.start_refused", { actorId: admin.id, societyId: input.societyId, reason: refusal });
    return { error: refusal };
  }

  const created = await db.inspection.create({
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

  logger.info("inspection.started", { actorId: admin.id, societyId: input.societyId, inspectionId: created.id });
  revalidatePath("/admin/inspections");
  revalidatePath(`/admin/inspections/${created.id}`);
  return { id: created.id };
}

export type FinalizeInspectionInput = {
  id: string;
  totalLightsChecked: number;
  societyRepName: string;
  notes: string;
  findings: {
    location: string;
    sensorStatus: InspectionSensorStatus;
    physicalDamage: boolean;
    actionReplace: boolean;
    remarks: string;
  }[];
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
    select: { voidedAt: true, totalLightsChecked: true },
  });
  if (!inspection) return { error: "That inspection no longer exists." };
  if (inspection.voidedAt) return { error: "This inspection has been voided." };
  if (inspection.totalLightsChecked !== null) return { error: "This inspection is already finalised." };

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
    logger.warn("inspection.finalize_refused", { actorId: admin.id, inspectionId: input.id, reason: refusal });
    return { error: refusal };
  }

  await db.inspection.update({
    where: { id: input.id },
    data: {
      totalLightsChecked: input.totalLightsChecked,
      societyRepName: input.societyRepName.trim() || null,
      notes: input.notes.trim() || null,
      findings: {
        create: findings.map((f) => ({
          srNo: f.srNo,
          location: f.location.trim(),
          sensorStatus: f.sensorStatus,
          physicalDamage: f.physicalDamage,
          actionReplace: f.actionReplace,
          remarks: f.remarks.trim() || null,
        })),
      },
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
