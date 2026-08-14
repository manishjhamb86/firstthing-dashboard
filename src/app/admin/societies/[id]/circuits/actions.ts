"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
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
  }
) {
  await requireAdminPermission("manage_survey");
  const session = await requireAdminPermission("manage_pipeline");

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
  if (!Number.isFinite(input.representedLightCount) || input.representedLightCount < input.meteredLightCount) {
    return { error: "Represented light count must be at least the metered light count." };
  }

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
    },
  });

  logger.info("circuit.configuration_updated", {
    actorId: session.user.id,
    circuitId,
    workingHoursChanged,
  });
  revalidatePath(`/admin/societies/${circuit.societyId}/circuits`);
  return {};
}
