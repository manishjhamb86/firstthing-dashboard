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
// CON-45 (2026-08-17, user's call): a candidate circuit is captured as an
// INVENTORY — line items from the device catalog, count × wattage × hours —
// not a single type/wattage pair. The inspector records what actually hangs
// off the circuit; the metered light count and connected load are derived
// from those lines, so the CON-16 ≥50 check and CON-17's load validation
// read the same record the inspector made, not a separately-typed number
// that can disagree with it.
export type CandidateLine = {
  deviceTypeId: string;
  count: number;
  wattage: number;
  hoursPerDay: number;
  /** Shares the circuit but is not being retrofitted — see the schema note. */
  excludedFromCalculation?: boolean;
};

export async function submitCircuitCandidate(input: {
  siteSurveyId: string;
  societyId: string;
  serviceLine: string;
  lightType: string;
  representedLightCount: number;
  lines: CandidateLine[];
  workingHours?: number;
  wifiReachable: boolean;
  fixturesUnder15ft: boolean;
  notOnDrivewayOrRamp: boolean;
}) {
  const session = await requireAdminPermission("manage_survey");

  if (!input.lines || input.lines.length === 0) {
    return { error: "Record at least one device line — the circuit's inventory is what everything downstream compares against." };
  }
  const types = await db.deviceType.findMany({
    where: { id: { in: input.lines.map((l) => l.deviceTypeId) }, role: "original", active: true, deletedAt: null },
  });
  const typeById = new Map(types.map((t) => [t.id, t]));
  for (const line of input.lines) {
    if (!typeById.has(line.deviceTypeId)) {
      return { error: "Pick every device from the catalog — if one is missing, ops can add it under Device catalog." };
    }
    if (!Number.isInteger(line.count) || line.count < 1 || line.count > 5000) {
      return { error: "Each line's count must be a whole number between 1 and 5000." };
    }
    if (!Number.isFinite(line.wattage) || line.wattage <= 0 || line.wattage > 2000) {
      return { error: "Each line's wattage must be between 1 and 2000 W." };
    }
    if (!Number.isFinite(line.hoursPerDay) || line.hoursPerDay <= 0 || line.hoursPerDay > 24) {
      return { error: "Each line's hours per day must be between 1 and 24." };
    }
  }

  // Derived, never typed separately: the count the ≥50 rule reads and the
  // wattage CON-17's count × wattage arithmetic uses. The weighted average
  // keeps count × wattage exactly equal to Σ(count × wattage).
  const meteredLightCount = input.lines.reduce((s, l) => s + l.count, 0);
  const connectedLoadW = input.lines.reduce((s, l) => s + l.count * l.wattage, 0);
  const wattage = connectedLoadW / meteredLightCount;

  if (!Number.isFinite(input.representedLightCount) || input.representedLightCount < meteredLightCount) {
    return { error: "Represented light count must be at least the metered light count." };
  }

  // CON-16's "no non-installation appliances share this circuit" was removed
  // 2026-08-26 (the user's call). It disqualified circuits that are live and
  // billing today; a shared fixture is now marked on its own device line and
  // deducted from both sides of the savings calculation instead.
  const hardCriteriaPass = input.wifiReachable && input.fixturesUnder15ft && input.notOnDrivewayOrRamp;

  const eligibilityChecklist = {
    wifiReachable: input.wifiReachable,
    fixturesUnder15ft: input.fixturesUnder15ft,
    notOnDrivewayOrRamp: input.notOnDrivewayOrRamp,
    lightCountMinMet: meteredLightCount >= 50,
  };

  // FEAT-007-AC-5 — a hard-criterion failure is ineligible outright, no
  // exception path exists for these (only the light-count minimum is).
  const state = !hardCriteriaPass ? "ineligible" : meteredLightCount >= 50 ? "eligible" : "surveyed";

  const circuit = await db.$transaction(async (tx) => {
    const created = await tx.circuit.create({
      data: {
        societyId: input.societyId,
        siteSurveyId: input.siteSurveyId,
        serviceLine: input.serviceLine as never,
        lightType: input.lightType.trim(),
        meteredLightCount,
        representedLightCount: input.representedLightCount,
        wattage,
        workingHours: input.workingHours ?? null,
        eligibilityChecklist,
        state,
        // Recorded so the person who added a candidate can tidy their own
        // mistake without waiting on the ops lead (src/lib/circuit-void.ts).
        createdById: session.user.id,
      },
    });
    await tx.circuitDevice.createMany({
      data: input.lines.map((l) => ({
        circuitId: created.id,
        deviceTypeId: l.deviceTypeId,
        count: l.count,
        wattage: l.wattage,
        hoursPerDay: l.hoursPerDay,
        excludedFromCalculation: l.excludedFromCalculation ?? false,
      })),
    });
    return created;
  });

  logger.info("survey.circuit_candidate_submitted", {
    circuitId: circuit.id,
    siteSurveyId: input.siteSurveyId,
    state,
    hardCriteriaPass,
    meteredLightCount,
    lines: input.lines.length,
    connectedLoadW,
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
  // Reads only the criteria that still exist. A circuit recorded before
  // 2026-08-26 carries the retired noSharedAppliances flag in its stored
  // checklist; it is simply not consulted, rather than being rewritten —
  // the checklist is the record of what the surveyor was asked.
  const hardCriteriaPass =
    checklist.wifiReachable && checklist.fixturesUnder15ft && checklist.notOnDrivewayOrRamp;
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
