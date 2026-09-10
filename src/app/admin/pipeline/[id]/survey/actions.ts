"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdminPermission, resolveAdmin } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";
import {
  CON16_HARD_CRITERIA,
  eligibilityState,
  LIGHT_COUNT_CRITERION,
  MIN_METERED_LIGHTS,
  outstandingCriteria,
} from "@/lib/circuit-eligibility";
import { refuseRepresentedCount } from "@/lib/light-type";

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
// hard criteria plus the light-count minimum (>=50). Every one of them is
// exception-able by operations since the CON-16 amendment of 2026-09-08; the
// difference is what an unwaived failure MEANS — a hard criterion leaves the
// circuit ineligible, a short light count leaves it awaiting a decision.
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
  /**
   * Operations waiving CON-16's ≥50 minimum at the moment of recording,
   * rather than the circuit landing `surveyed` and waiting for a second act
   * on the survey page (user-asked 2026-09-10: "allow exception for number of
   * lights after warning the user"). Blank or absent means no exception — the
   * old behaviour, unchanged.
   */
  lightCountExceptionReason?: string;
}) {
  const session = await requireAdminPermission("manage_survey");

  if (!input.lines || input.lines.length === 0) {
    return { error: "Record at least one device line — the circuit's inventory is what everything downstream compares against." };
  }
  const types = await db.deviceType.findMany({
    where: {
      id: { in: input.lines.map((l) => l.deviceTypeId) },
      role: "original",
      active: true,
      deletedAt: null,
      // A proposed type is allowed on the line — the surveyor has to be able
      // to finish. A REJECTED one never is: operations already said that
      // fixture is not what should be recorded here.
      status: { in: ["approved", "proposed"] },
    },
  });
  const typeById = new Map(types.map((t) => [t.id, t]));
  for (const line of input.lines) {
    if (!typeById.has(line.deviceTypeId)) {
      return { error: "Pick every device from the list — if one is missing, add it and operations will confirm it." };
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

  const repRefusal = refuseRepresentedCount(input.representedLightCount, meteredLightCount);
  if (repRefusal) return { error: repRefusal };

  // CON-16's "no non-installation appliances share this circuit" was removed
  // 2026-08-26 (the user's call). It disqualified circuits that are live and
  // billing today; a shared fixture is now marked on its own device line and
  // deducted from both sides of the savings calculation instead.
  const eligibilityChecklist = {
    wifiReachable: input.wifiReachable,
    fixturesUnder15ft: input.fixturesUnder15ft,
    notOnDrivewayOrRamp: input.notOnDrivewayOrRamp,
    lightCountMinMet: meteredLightCount >= 50,
  };

  // The exception at capture. Everything about it is decided HERE, never by
  // the form: the client sends a reason, and the server alone decides whether
  // that reason may waive anything.
  //
  // Three refusals, and each is the same rule the survey page's own control
  // already enforces — this is a second entry point to one decision, not a
  // softer one:
  //  · only operations may approve (FEAT-007-AC-4's PER-01 proxy: BOTH
  //    permissions). A field surveyor recording a short circuit still gets
  //    the warning and still lands `surveyed`, exactly as before.
  //  · only when the light count is genuinely short — nothing to waive
  //    otherwise, and a stored waiver that waived nothing is a false record.
  //  · only when it is the ONLY thing in the way. A failed hard criterion is
  //    a different decision with a different consequence (a waived WiFi
  //    criterion commits FirsThing to bringing a router), and it stays on the
  //    survey page where the waiver note is shown beside it.
  const wantsException = (input.lightCountExceptionReason ?? "").trim() !== "";
  const waived: string[] = [];
  if (wantsException) {
    const admin = await resolveAdmin();
    // Typed, not thrown: a surveyor legitimately reaching this path deserves
    // a sentence, and a thrown Server Action is an opaque digest in
    // production — the defect class already fixed in getReadingUploadUrl.
    if (!admin?.permissions.includes("manage_pipeline")) {
      logger.warn("survey.capture_exception_refused", {
        actor: session.user.id,
        reason: "not_operations",
      });
      return {
        error:
          "Approving an exception to the 50-light minimum is an operations lead's decision. Record the circuit as it stands — it will wait for that approval on this page.",
      };
    }
    if (meteredLightCount >= MIN_METERED_LIGHTS) {
      return { error: `This circuit meets the ${MIN_METERED_LIGHTS}-light minimum — there is no exception to approve.` };
    }
    const hardFailed = CON16_HARD_CRITERIA.filter(
      (k) => eligibilityChecklist[k.name as keyof typeof eligibilityChecklist] !== true,
    );
    if (hardFailed.length > 0) {
      return {
        error: `${hardFailed.map((k) => k.label).join(" and ")} ${hardFailed.length === 1 ? "is" : "are"} also unconfirmed, and those are a separate decision. Record the circuit, then approve the exception from the candidate below.`,
      };
    }
    waived.push(LIGHT_COUNT_CRITERION);
  }

  // One derivation, shared with the correction and the exception paths
  // (src/lib/circuit-eligibility.ts) — a candidate recorded, corrected and
  // waived must never disagree about what its own answers mean.
  const state = eligibilityState({ eligibilityChecklist, meteredLightCount, waived });

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
        // The checklist is NOT rewritten to say the minimum was met — it
        // stays the record of what the site actually is. The waiver sits
        // beside it, exactly as the survey page's own approval records it.
        eligibilityExceptionCriteria: waived,
        ...(waived.length > 0
          ? {
              lightCountExceptionApprovedBy: session.user.id,
              lightCountExceptionReason: (input.lightCountExceptionReason ?? "").trim(),
            }
          : {}),
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
    outstanding: outstandingCriteria({ eligibilityChecklist, meteredLightCount }),
    meteredLightCount,
    lines: input.lines.length,
    connectedLoadW,
  });

  revalidatePath("/admin/pipeline");
  return { circuitId: circuit.id, state };
}

// FEAT-007-AC-3/AC-4 — CON-16 exception approval. Amended 2026-09-08 (the
// user's call, "Allow exception. from admin side"): an exception may waive a
// HARD criterion, not only the light-count minimum. AC-5's "no exception path"
// held that a driveway circuit is simply not a demo circuit — true of the site,
// but on stage it left two deals stopped dead with the only route being to
// delete the candidate and re-record it. Ops now decides, with the criterion
// waived and the reason recorded, and the surveyor's own answers left intact.
// Gated on holding
// BOTH manage_pipeline and manage_survey: our permission model doesn't
// carry a distinct "PER-01 specifically" marker, and PER-01 (ops) is the
// one population expected to hold every back-office permission, so holding
// both is the technical proxy for "PER-01, not just any PER-04" — recorded
// as a real auth-strategy decision in PROJECT_CONTEXT.md, not an accident.
export async function approveEligibilityException(circuitId: string, reason: string) {
  await requireAdminPermission("manage_survey");
  const session = await requireAdminPermission("manage_pipeline");

  if (!reason.trim()) return { error: "A reason is required to approve the exception." };

  const circuit = await db.circuit.findUnique({ where: { id: circuitId } });
  if (!circuit) return { error: "Circuit not found." };

  // Only from the two states an eligibility decision is still open in. A
  // circuit already commissioning was authorised against the checklist as it
  // stands, and waiving a criterion after the fact would rewrite what the work
  // was approved on — the FEAT-040 shape, guarded on the path nobody is
  // looking at while building the new one.
  if (circuit.state !== "ineligible" && circuit.state !== "surveyed") {
    return { error: "This circuit has already passed its eligibility decision." };
  }

  const outstanding = outstandingCriteria({
    eligibilityChecklist: circuit.eligibilityChecklist,
    meteredLightCount: circuit.meteredLightCount,
    waived: circuit.eligibilityExceptionCriteria,
  });
  if (outstanding.length === 0) return { error: "This circuit doesn't need an exception." };

  const waived = [...circuit.eligibilityExceptionCriteria, ...outstanding];

  await db.circuit.update({
    where: { id: circuitId },
    data: {
      // The checklist is NOT rewritten: it stays the record of what the
      // surveyor was asked and answered. The waiver sits beside it.
      eligibilityExceptionCriteria: waived,
      state: eligibilityState({
        eligibilityChecklist: circuit.eligibilityChecklist,
        meteredLightCount: circuit.meteredLightCount,
        waived,
      }),
      lightCountExceptionApprovedBy: session.user.id,
      lightCountExceptionReason: reason.trim(),
    },
  });

  logger.info("survey.eligibility_exception_approved", {
    circuitId,
    approvedBy: session.user.id,
    waived: outstanding,
    reason,
  });
  revalidatePath("/admin/pipeline");
  return {};
}

/**
 * Correct the recorded checklist answers.
 *
 * Deliberately a DIFFERENT act from the exception above, and the distinction
 * is the whole point: correcting says the recorded answer was wrong, an
 * exception says the answer stands and operations is proceeding anyway. One
 * control that did both would let a site fact be quietly rewritten to clear a
 * gate, which is what INV-02's provenance rules exist to stop.
 *
 * Operations only — the same rule as correcting a lead's own record: the
 * surveyor's answers exist so that the people they bind cannot rewrite them.
 */
export async function correctCircuitEligibility(
  circuitId: string,
  checks: { wifiReachable: boolean; fixturesUnder15ft: boolean; notOnDrivewayOrRamp: boolean },
  note: string,
) {
  await requireAdminPermission("manage_survey");
  const session = await requireAdminPermission("manage_pipeline");

  if (!note.trim()) return { error: "Say what was re-checked — a correction with no stated basis is not auditable." };

  const circuit = await db.circuit.findUnique({ where: { id: circuitId } });
  if (!circuit) return { error: "Circuit not found." };
  if (circuit.state !== "ineligible" && circuit.state !== "surveyed") {
    return { error: "This circuit has already passed its eligibility decision." };
  }

  const previous = (circuit.eligibilityChecklist ?? {}) as Record<string, unknown>;
  const eligibilityChecklist = {
    ...previous,
    wifiReachable: checks.wifiReachable,
    fixturesUnder15ft: checks.fixturesUnder15ft,
    notOnDrivewayOrRamp: checks.notOnDrivewayOrRamp,
    lightCountMinMet: circuit.meteredLightCount >= 50,
    correctedAt: new Date().toISOString(),
    correctedById: session.user.id,
    correctedNote: note.trim(),
  };

  await db.circuit.update({
    where: { id: circuitId },
    data: {
      eligibilityChecklist,
      state: eligibilityState({
        eligibilityChecklist,
        meteredLightCount: circuit.meteredLightCount,
        waived: circuit.eligibilityExceptionCriteria,
      }),
    },
  });

  logger.info("survey.eligibility_corrected", {
    circuitId,
    correctedBy: session.user.id,
    from: {
      wifiReachable: previous.wifiReachable,
      fixturesUnder15ft: previous.fixturesUnder15ft,
      notOnDrivewayOrRamp: previous.notOnDrivewayOrRamp,
    },
    to: checks,
    note,
  });
  revalidatePath("/admin/pipeline");
  return {};
}
