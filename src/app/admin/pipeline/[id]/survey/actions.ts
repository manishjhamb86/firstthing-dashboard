"use server";

import { DEMO_LIGHTS_SELECT, demoLightsInstalled, fullFromTotal } from "@/lib/light-population";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdminPermission, resolveAdmin } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";
import { eligibilityState, outstandingCriteria } from "@/lib/circuit-eligibility";
import { lightTypeKey } from "@/lib/light-type";
import { querySectionAs, surveyForWrite } from "@/lib/survey-core";
import { recordCandidateAs, type CandidateLine } from "@/lib/circuit-candidate-core";

/**
 * The survey lock (19-field-app.md §16): once a survey has been submitted from
 * the field, a field account may not change it here either — only in a section
 * the office has queried. Operations, reviewing it, still may.
 */
async function lockRefusal(siteSurveyId: string, section: "inventory" | "circuits"): Promise<string | null> {
  const actor = await resolveAdmin();
  if (!actor) return "Your session has ended. Sign in again.";
  const g = await surveyForWrite(actor, siteSurveyId, section);
  return g.error ?? null;
}

// FEAT-006: whole-society lighting inventory by area, distinct from the
// single sample Circuit metered for the benchmark (CON-11).
export async function addLightingInventoryArea(input: {
  siteSurveyId: string;
  area: string;
  lightType: string;
  count: number;
  method: "walked" | "records" | "estimated";
  note?: string;
}) {
  await requireAdminPermission("manage_survey");
  const locked = await lockRefusal(input.siteSurveyId, "inventory");
  if (locked) return { error: locked };

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

/**
 * Correct an area's count after the fact (user-asked 2026-09-16: "as on
 * installation light count can change"). The inventory is CON-11's
 * extrapolation base; a changed count is stated as a change — old and new in
 * the log line — and the candidate circuit that represents this light type is
 * NOT silently moved: its represented count is corrected on its own page,
 * where the offer and the bill read it.
 */
export async function updateLightingInventoryArea(
  id: string,
  siteSurveyId: string,
  input: {
    count: number;
    method: "walked" | "records" | "estimated";
    note?: string;
    /**
     * The row's own area/light-type names, typed as recorded with no
     * standard casing or spelling check (2026-10-08, user-asked, from the
     * same "allow editing names" report as the candidate circuit's own
     * rename). Optional so every existing caller omitting them is
     * unaffected. Safe to rename for the same reason the circuit's own
     * lightType is: both are read as plain labels, matched to each other
     * only through lightTypeKey()'s normalisation at read time, below.
     */
    area?: string;
    lightType?: string;
  },
): Promise<{ error?: string; circuit?: { from: number; to: number } | null; circuitNote?: string }> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!actor.permissions.includes("manage_survey")) {
    logger.warn("survey.lighting_inventory_area_update_refused", { actorId: actor.id, rowId: id, reason: "no_permission" });
    return { error: "Correcting the inventory is field work — it needs the survey permission." };
  }
  const row = await db.lightingInventoryArea.findUnique({ where: { id } });
  if (!row || row.siteSurveyId !== siteSurveyId) return { error: "That inventory row no longer exists." };
  const locked = await lockRefusal(siteSurveyId, "inventory");
  if (locked) return { error: locked };
  if (!Number.isFinite(input.count) || input.count < 0 || !Number.isInteger(input.count)) {
    return { error: "Count must be a non-negative whole number." };
  }
  if (input.method === "estimated" && !input.note?.trim()) {
    return { error: "A note is required when the count is estimated, not walked." };
  }
  if (input.area !== undefined && !input.area.trim()) return { error: "Area can't be blank." };
  if (input.lightType !== undefined && !input.lightType.trim()) return { error: "Light type can't be blank." };
  // The effective values after this edit — every downstream match/aggregate
  // below uses these, never the stale row.area/row.lightType, so a rename
  // takes effect immediately rather than leaving this save matched against
  // the name it just corrected away from.
  const area = input.area?.trim() || row.area;
  const lightType = input.lightType?.trim() || row.lightType;

  // The inventory IS the population (user-caught 2026-09-16: "demo savings
  // report still shows 1773 even after regenerating"). The candidate circuit
  // for this light type follows the corrected total — forward only, as a
  // RepresentedCountChange effective this month (the same audit row an
  // invoice's count correction writes; CON-47 (d)): earlier months, and an
  // issued offer's own snapshot, keep saying what they were computed on.
  let applied: { from: number; to: number } | null = null;
  let circuitNote: string | undefined;
  await db.$transaction(async (tx) => {
    await tx.lightingInventoryArea.update({
      where: { id },
      data: { count: input.count, method: input.method, note: input.note?.trim() || null, area, lightType },
    });
    const total = (
      await tx.lightingInventoryArea.aggregate({ where: { siteSurveyId, lightType, voidedAt: null }, _sum: { count: true } })
    )._sum.count ?? 0;
    // The inventory's light type and the candidate's are two free-text
    // fields ("Surface Light 12W" on one, "Lift Lobby and Staircase" on the
    // other — the user's own deal, 2026-09-16, where an exact match found
    // nothing and applied nothing, silently). Match on the normalised key;
    // failing that, a deal with ONE live circuit has only one population the
    // inventory can be describing.
    const live = await tx.circuit.findMany({
      where: { siteSurveyId, voidedAt: null },
      select: { id: true, lightType: true, location: true, representedLightCount: true, ...DEMO_LIGHTS_SELECT },
    });
    const byType = live.filter((c) => lightTypeKey(c.lightType) === lightTypeKey(lightType));
    const circuits = byType.length > 0 ? byType : live.length === 1 ? live : [];
    if (circuits.length !== 1) {
      circuitNote =
        circuits.length > 1
          ? "More than one circuit carries this light type — correct each one's represented count on its own page."
          : live.length === 0
            ? undefined
            : `No candidate circuit matches the light type "${lightType}" (${live.map((c) => c.lightType).join(", ")}) — correct the represented count on the circuit's own page.`;
      return;
    }
    const c = circuits[0];
    // The inventory counts every light of the type, the demo circuit's
    // included; the circuit stores the full installation, which does not
    // (2026-09-27).
    const full = fullFromTotal(total, demoLightsInstalled(c));
    if (c.representedLightCount === full) return;
    const d = new Date();
    const effectiveFrom = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    await tx.circuit.update({ where: { id: c.id }, data: { representedLightCount: full } });
    await tx.representedCountChange.create({
      data: {
        circuitId: c.id,
        previousCount: c.representedLightCount,
        nextCount: full,
        effectiveFrom,
        reason: `Lighting inventory corrected on the site survey (${area}: ${row.count} → ${input.count}); full installation = ${total} counted − ${total - full} demo lights.`,
        recordedById: actor.id,
      },
    });
    applied = { from: c.representedLightCount, to: full };
    logger.info("circuit.represented_count_applied_from_inventory", {
      actorId: actor.id,
      circuitId: c.id,
      previous: c.representedLightCount,
      next: full,
      inventoryTotal: total,
      effectiveFrom,
    });
  });
  logger.info("survey.lighting_inventory_area_updated", {
    actorId: actor.id,
    siteSurveyId,
    rowId: id,
    from: { area: row.area, lightType: row.lightType, count: row.count, method: row.method },
    to: { area, lightType, count: input.count, method: input.method },
    circuitApplied: applied,
  });
  revalidatePath(`/admin/pipeline`);
  revalidatePath(`/admin/societies`);
  return { circuit: applied, circuitNote };
}

export async function deleteLightingInventoryArea(id: string, siteSurveyId: string) {
  await requireAdminPermission("manage_survey");
  const locked = await lockRefusal(siteSurveyId, "inventory");
  if (locked) return { error: locked };
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
export type { CandidateLine } from "@/lib/circuit-candidate-core";

export async function submitCircuitCandidate(input: {
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
}) {  await requireAdminPermission("manage_survey");
  const locked = await lockRefusal(input.siteSurveyId, "circuits");
  if (locked) return { error: locked };
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session has ended. Sign in again." };
  const r = await recordCandidateAs(actor, input);
  if ("error" in r) return { error: r.error };
  revalidatePath("/admin/pipeline");
  return { circuitId: r.circuitId, state: r.state };
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
  checks: { wifiReachable: boolean; fixturesUnder15ft: boolean; notOnDrivewayOrRamp: boolean; notInStiltParking: boolean },
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
    notInStiltParking: checks.notInStiltParking,
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
      notInStiltParking: previous.notInStiltParking,
    },
    to: checks,
    note,
  });
  revalidatePath("/admin/pipeline");
  return {};
}

/**
 * The office queries a section of a submitted field survey (05-field.md §0.5,
 * SCR-014's "query a count"): that section only reopens on every team
 * member's phone, with the note pinned at its top.
 */
export async function querySurveySection(pipelineId: string, surveyId: string, section: "profile" | "inventory" | "circuits" | "pump_room", note: string) {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session has ended. Sign in again." };
  const r = await querySectionAs(actor, { surveyId, section, note });
  if ("error" in r) {
    logger.warn("survey.query_refused", { actorId: actor.id, surveyId, section, reason: r.error });
    return { error: r.error };
  }
  revalidatePath(`/admin/pipeline/${pipelineId}/survey`);
  return {};
}
