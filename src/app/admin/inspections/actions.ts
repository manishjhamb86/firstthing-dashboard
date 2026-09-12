"use server";

// The monthly inspection checklist — filing is field work (PER-03/PER-04,
// manage_survey, the same permission gate_pass submission, benchmark
// rescale entry and circuit replacement all use), voiding is operations
// only (the same asymmetry as circuit-void.ts: removing a record someone
// else can act on is a bigger deal than filing one). resolveAdmin() +
// typed errors throughout, not requireAdminPermission — that helper throws,
// which surfaces as an opaque production digest, a defect already found and
// fixed twice elsewhere in this codebase (getReadingUploadUrl, the rescale
// correction action).

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { resolveAdmin } from "@/lib/admin-permissions";
import { isOperations } from "@/lib/admin-teams";
import { logger } from "@/lib/logger";
import {
  refuseInspectionSave,
  refuseVoidInspection,
  type FindingInput,
  type InspectionSaveInput,
} from "@/lib/inspection";
import type { InspectionSensorStatus } from "@prisma/client";

export type CreateInspectionInput = {
  societyId: string;
  area: string;
  period: string;
  inspectedAt: string; // datetime-local value
  inspectorName: string;
  inspectorContact: string;
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

export async function createInspection(
  input: CreateInspectionInput,
): Promise<{ id: string } | { error: string }> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };
  if (!admin.permissions.includes("manage_survey")) {
    logger.warn("inspection.save_refused", { actorId: admin.id, reason: "permission" });
    return { error: "Filing an inspection is field work (Manage survey)." };
  }

  const society = await db.society.findUnique({ where: { id: input.societyId }, select: { id: true } });
  if (!society) return { error: "That society no longer exists." };

  const area = input.area.trim();
  // input.inspectedAt is an <input type="datetime-local"> value ("YYYY-MM-DDTHH:mm") with no
  // timezone designator — parsing it bare is locale-dependent (Node reads it as the SERVER's
  // local time), which silently shifted a typed "10:30" into a different stored instant. This
  // codebase's own rule ("typed by a person" fields are stored/read as UTC, never converted) is
  // applied explicitly here, the same way every date-only input already does with "T00:00:00Z".
  const inspectedAt = new Date(`${input.inspectedAt}:00Z`);

  const findings: FindingInput[] = input.findings.map((f, i) => ({
    srNo: i + 1,
    location: f.location,
    sensorStatus: f.sensorStatus,
    physicalDamage: f.physicalDamage,
    actionReplace: f.actionReplace,
    remarks: f.remarks,
  }));

  const saveInput: InspectionSaveInput = {
    area,
    period: input.period,
    inspectedAt,
    inspectorName: input.inspectorName,
    inspectorContact: input.inspectorContact,
    totalLightsChecked: input.totalLightsChecked,
    societyRepName: input.societyRepName,
    notes: input.notes,
    findings,
  };

  const existing = await db.inspection.findUnique({
    where: { societyId_area_period: { societyId: input.societyId, area, period: input.period } },
    select: { id: true, voidedAt: true },
  });

  const refusal = refuseInspectionSave(saveInput, {
    now: new Date(),
    existingActiveForSlot: existing !== null && existing.voidedAt === null,
  });
  if (refusal) {
    logger.warn("inspection.save_refused", { actorId: admin.id, societyId: input.societyId, reason: refusal });
    return { error: refusal };
  }

  const created = await db.inspection.create({
    data: {
      societyId: input.societyId,
      area,
      period: input.period,
      inspectedAt,
      inspectorName: input.inspectorName.trim(),
      inspectorContact: input.inspectorContact.trim(),
      totalLightsChecked: input.totalLightsChecked,
      societyRepName: input.societyRepName.trim() || null,
      notes: input.notes.trim() || null,
      createdById: admin.id,
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

  logger.info("inspection.filed", {
    actorId: admin.id,
    societyId: input.societyId,
    inspectionId: created.id,
    findingCount: findings.length,
  });
  revalidatePath("/admin/inspections");
  revalidatePath(`/admin/inspections/${created.id}`);
  return { id: created.id };
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
