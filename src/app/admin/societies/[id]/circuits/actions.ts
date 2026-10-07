"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { refuseFullInstallationCount } from "@/lib/light-population";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";

// FEAT-040: circuit registry & configuration. Editing is PER-01-only
// (FEAT-040-AC-4) — same "hold both permissions" proxy already established
// for FEAT-007's light-count exception approval, since our permission model
// has no distinct "PER-01 specifically" marker. PER-04 (manage_survey alone)
// can still read the registry, just not edit it.
export async function updateCircuitConfiguration(
  circuitId: string,
  input: {
    location: string;
    meteredLightCount: number;
    representedLightCount: number;
    wattage: number;
    workingHours?: number;
    /**
     * The circuit's own display name — "basement", "TubeLight" — typed
     * as-recorded at survey time with no standard casing or spelling check
     * (2026-10-08, user-asked: "give option to edit names"). Optional so
     * every existing caller that doesn't pass it is unaffected; lightType
     * is only ever read as a label and through lightTypeKey()'s own
     * normalisation at read time, never stored as a separate matching key
     * elsewhere, so renaming it carries no staleness risk.
     */
    lightType?: string;
  }
) {
  await requireAdminPermission("manage_survey");
  const session = await requireAdminPermission("manage_pipeline");

  if (input.lightType !== undefined && !input.lightType.trim()) {
    return { error: "Light type can't be blank." };
  }

  // FEAT-040-AC-3 — zero/negative light count or wattage refused outright
  // (feeds CON-17 load validation and CON-11 extrapolation directly); a
  // represented count below the metered count is refused too, since the
  // extrapolation factor would fall below 1, never physically meaningful.
  if (!Number.isFinite(input.meteredLightCount) || input.meteredLightCount <= 0) {
    return { error: "Light count must be a positive number." };
  }
  if (!Number.isFinite(input.wattage) || input.wattage <= 0) {
    return { error: "Wattage must be a positive number." };
  }
  const repRefusal = refuseFullInstallationCount(input.representedLightCount);
  if (repRefusal) return { error: repRefusal };

  const circuit = await db.circuit.findUnique({ where: { id: circuitId } });
  if (!circuit) return { error: "Circuit not found." };

  // INV-07 — once a circuit has a commissioned baseline, its metered light
  // count is no longer free-form config: changing it rescales a billable
  // figure (CON-10), so it has to go through FEAT-041's verified, dated,
  // evented path instead. This route existed before FEAT-041 did and would
  // otherwise let the count move with no verification and no rescale
  // event at all — silently detaching the baseline from the count that
  // produced it, which is precisely what the invariant guards against.
  if (
    circuit.preInstallBaseline != null &&
    input.meteredLightCount !== circuit.meteredLightCount
  ) {
    return {
      error:
        "This circuit is commissioned — a metered light-count change rescales its baseline, so record it as a verified light-count change instead.",
    };
  }

  // FEAT-040-AC-5 — a working-hours change is metadata only, stamped with
  // an effective date; it never triggers a benchmark rescale on its own
  // (CON-10). An off-band month caused by it goes through CAP-05's normal
  // deviation review, not this action.
  const workingHoursChanged = (input.workingHours ?? null) !== circuit.workingHours;

  await db.circuit.update({
    where: { id: circuitId },
    data: {
      location: input.location.trim() || null,
      meteredLightCount: input.meteredLightCount,
      representedLightCount: input.representedLightCount,
      wattage: input.wattage,
      workingHours: input.workingHours ?? null,
      ...(workingHoursChanged ? { workingHoursEffectiveAt: new Date() } : {}),
      ...(input.lightType !== undefined ? { lightType: input.lightType.trim() } : {}),
    },
  });

  logger.info("circuit.configuration_updated", {
    actorId: session.user.id,
    circuitId,
    workingHoursChanged,
    lightTypeChanged: input.lightType !== undefined,
  });
  revalidatePath(`/admin/societies/${circuit.societyId}/circuits`);
  if (input.lightType !== undefined && circuit.siteSurveyId) {
    const survey = await db.siteSurvey.findUnique({ where: { id: circuit.siteSurveyId }, select: { pipelineId: true } });
    if (survey) revalidatePath(`/admin/pipeline/${survey.pipelineId}/survey`);
  }
  return {};
}
