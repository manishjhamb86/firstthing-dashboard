"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";

// FEAT-006: whole-society lighting inventory by area, distinct from the
// single sample Circuit metered for the benchmark (CON-11).
export async function addLightingInventoryArea(input: {
  siteSurveyId: string;
  area: string;
  lightType: string;
  count: number;
  method: "walked" | "estimated";
  note?: string;
}) {
  await requireAdminPermission("manage_survey");

  if (!input.area.trim() || !input.lightType.trim()) return { error: "Area and light type are required." };
  if (!Number.isFinite(input.count) || input.count < 0 || !Number.isInteger(input.count)) {
    return { error: "Count must be a non-negative whole number." };
  }
  // FEAT-006-AC-6 — an estimated count requires a note explaining why it
  // wasn't walked; this is what a desk reviewer has to judge it by later.
  if (input.method === "estimated" && !input.note?.trim()) {
    return { error: "A note is required when the count is estimated, not walked." };
  }

  const row = await db.lightingInventoryArea.create({
    data: {
      siteSurveyId: input.siteSurveyId,
      area: input.area.trim(),
      lightType: input.lightType.trim(),
      count: input.count,
      method: input.method,
      note: input.note?.trim() || null,
    },
  });

  logger.info("survey.lighting_inventory_area_added", { siteSurveyId: input.siteSurveyId, rowId: row.id });
  revalidatePath(`/admin/pipeline`);
  return {};
}

export async function deleteLightingInventoryArea(id: string, siteSurveyId: string) {
  await requireAdminPermission("manage_survey");
  await db.lightingInventoryArea.delete({ where: { id } });
  logger.info("survey.lighting_inventory_area_removed", { siteSurveyId, rowId: id });
  revalidatePath(`/admin/pipeline`);
  return {};
}

// FEAT-007: demo-circuit selection & CON-16 eligibility checklist. Four
// hard criteria (no exception path, FEAT-007-AC-5) plus the one
// exception-able minimum (light count >= 50, FEAT-007-AC-3).
export async function submitCircuitCandidate(input: {
  siteSurveyId: string;
  societyId: string;
  serviceLine: string;
  lightType: string;
  meteredLightCount: number;
  representedLightCount: number;
  wattage: number;
  workingHours?: number;
  noSharedAppliances: boolean;
  wifiReachable: boolean;
  fixturesUnder15ft: boolean;
  notOnDrivewayOrRamp: boolean;
}) {
  await requireAdminPermission("manage_survey");

  if (!Number.isFinite(input.meteredLightCount) || input.meteredLightCount <= 0) {
    return { error: "Light count must be a positive number." };
  }
  if (!Number.isFinite(input.wattage) || input.wattage <= 0) {
    return { error: "Wattage must be a positive number." };
  }
  if (!Number.isFinite(input.representedLightCount) || input.representedLightCount < input.meteredLightCount) {
    return { error: "Represented light count must be at least the metered light count." };
  }

  const hardCriteriaPass =
    input.noSharedAppliances && input.wifiReachable && input.fixturesUnder15ft && input.notOnDrivewayOrRamp;

  const eligibilityChecklist = {
    noSharedAppliances: input.noSharedAppliances,
    wifiReachable: input.wifiReachable,
    fixturesUnder15ft: input.fixturesUnder15ft,
    notOnDrivewayOrRamp: input.notOnDrivewayOrRamp,
    lightCountMinMet: input.meteredLightCount >= 50,
  };

  // FEAT-007-AC-5 — a hard-criterion failure is ineligible outright, no
  // exception path exists for these (only the light-count minimum is).
  const state = !hardCriteriaPass ? "ineligible" : input.meteredLightCount >= 50 ? "eligible" : "surveyed";

  const circuit = await db.circuit.create({
    data: {
      societyId: input.societyId,
      siteSurveyId: input.siteSurveyId,
      serviceLine: input.serviceLine as never,
      lightType: input.lightType.trim(),
      meteredLightCount: input.meteredLightCount,
      representedLightCount: input.representedLightCount,
      wattage: input.wattage,
      workingHours: input.workingHours ?? null,
      eligibilityChecklist,
      state,
    },
  });

  logger.info("survey.circuit_candidate_submitted", {
    circuitId: circuit.id,
    siteSurveyId: input.siteSurveyId,
    state,
    hardCriteriaPass,
    meteredLightCount: input.meteredLightCount,
  });

  revalidatePath("/admin/pipeline");
  return { circuitId: circuit.id, state };
}

// FEAT-007-AC-3/AC-4 — light-count exception approval. Gated on holding
// BOTH manage_pipeline and manage_survey: our permission model doesn't
// carry a distinct "PER-01 specifically" marker, and PER-01 (ops) is the
// one population expected to hold every back-office permission, so holding
// both is the technical proxy for "PER-01, not just any PER-04" — recorded
// as a real auth-strategy decision in PROJECT_CONTEXT.md, not an accident.
export async function approveLightCountException(circuitId: string, reason: string) {
  await requireAdminPermission("manage_survey");
  const session = await requireAdminPermission("manage_pipeline");

  if (!reason.trim()) return { error: "A reason is required to approve the exception." };

  const circuit = await db.circuit.findUnique({ where: { id: circuitId } });
  if (!circuit) return { error: "Circuit not found." };
  if (circuit.meteredLightCount >= 50) return { error: "This circuit doesn't need an exception." };

  const checklist = (circuit.eligibilityChecklist as Record<string, boolean>) ?? {};
  const hardCriteriaPass =
    checklist.noSharedAppliances && checklist.wifiReachable && checklist.fixturesUnder15ft && checklist.notOnDrivewayOrRamp;
  if (!hardCriteriaPass) return { error: "This circuit fails a hard criterion — no exception path applies." };

  await db.circuit.update({
    where: { id: circuitId },
    data: {
      state: "eligible",
      lightCountExceptionApprovedBy: session.user.id,
      lightCountExceptionReason: reason.trim(),
    },
  });

  logger.info("survey.light_count_exception_approved", { circuitId, approvedBy: session.user.id, reason });
  revalidatePath("/admin/pipeline");
  return {};
}
