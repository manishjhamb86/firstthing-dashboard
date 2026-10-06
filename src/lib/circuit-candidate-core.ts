import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { refuseFullInstallationCount } from "@/lib/light-population";
import {
  CON16_HARD_CRITERIA,
  eligibilityState,
  LIGHT_COUNT_CRITERION,
  MIN_METERED_LIGHTS,
  outstandingCriteria,
} from "@/lib/circuit-eligibility";

// Recording a demo-circuit candidate (FEAT-007, CON-45's device lines), shared
// by the office survey page and the field app's sync route
// (19-field-app.md §16) — moved here unchanged from the office action, so the
// phone is refused for exactly what the desk is. The caller checks field
// access and the survey lock; this takes the account.

export type CandidateLine = {
  deviceTypeId: string;
  count: number;
  wattage: number;
  hoursPerDay: number;
  /** Shares the circuit but is not being retrofitted — see the schema note. */
  excludedFromCalculation?: boolean;
};

export async function recordCandidateAs(actor: { id: string; permissions: string[] }, input: {
  siteSurveyId: string;
  societyId: string;
  serviceLine: string;
  lightType: string;
  /** Where the circuit is — names it on every list; optional, since not every survey records one. */
  location?: string;
  representedLightCount: number;
  lines: CandidateLine[];
  workingHours?: number;
  wifiReachable: boolean;
  fixturesUnder15ft: boolean;
  notOnDrivewayOrRamp: boolean;
  notInStiltParking: boolean;
  /**
   * Operations waiving CON-16's ≥50 minimum at the moment of recording,
   * rather than the circuit landing `surveyed` and waiting for a second act
   * on the survey page (user-asked 2026-09-10: "allow exception for number of
   * lights after warning the user"). Blank or absent means no exception — the
   * old behaviour, unchanged.
   */
  lightCountExceptionReason?: string;
  /** Made on the phone, so a replay finds the circuit instead of adding a second. */
  circuitId?: string;
  /** SCR-012: why this circuit represents the rest of its type. */
  typicalityNote?: string;
}): Promise<{ error: string } | { circuitId: string; state: "eligible" | "surveyed" | "ineligible" }> {

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

  const repRefusal = refuseFullInstallationCount(input.representedLightCount);
  if (repRefusal) return { error: repRefusal };

  // CON-16's "no non-installation appliances share this circuit" was removed
  // 2026-08-26 (the user's call). It disqualified circuits that are live and
  // billing today; a shared fixture is now marked on its own device line and
  // deducted from both sides of the savings calculation instead.
  const eligibilityChecklist = {
    wifiReachable: input.wifiReachable,
    fixturesUnder15ft: input.fixturesUnder15ft,
    notOnDrivewayOrRamp: input.notOnDrivewayOrRamp,
    notInStiltParking: input.notInStiltParking,
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
    // Typed, not thrown: a surveyor legitimately reaching this path deserves
    // a sentence, and a thrown Server Action is an opaque digest in
    // production — the defect class already fixed in getReadingUploadUrl.
    if (!actor.permissions.includes("manage_pipeline")) {
      logger.warn("survey.capture_exception_refused", {
        actor: actor.id,
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
        ...(input.circuitId ? { id: input.circuitId } : {}),
        typicalityNote: input.typicalityNote?.trim() || null,
        societyId: input.societyId,
        siteSurveyId: input.siteSurveyId,
        serviceLine: input.serviceLine as never,
        lightType: input.lightType.trim(),
        location: input.location?.trim() || null,
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
              lightCountExceptionApprovedBy: actor.id,
              lightCountExceptionReason: (input.lightCountExceptionReason ?? "").trim(),
            }
          : {}),
        // Recorded so the person who added a candidate can tidy their own
        // mistake without waiting on the ops lead (src/lib/circuit-void.ts).
        createdById: actor.id,
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

  return { circuitId: circuit.id, state };
}
