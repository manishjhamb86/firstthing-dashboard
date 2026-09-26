"use server";

// Circuit-level actions. Every commissioning step (meter, gate passes,
// periods, readings, replacement) moved onto the demo it belongs to on
// 2026-09-26 — see demo-step-actions.ts.

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { resolveAdmin } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";
import { refuseRepresentedCount } from "@/lib/light-type";

/**
 * Correct CON-11's extrapolation base.
 *
 * The represented count is the population the metered circuit stands in for,
 * and `demo-report.ts` scales the measured saving by
 * `represented / metered` — so the monthly fee is computed on THIS figure, not
 * on the lights actually metered. A circuit left representing only its own
 * lights has an extrapolation factor of 1 and under-bills by the whole factor,
 * silently: Indiabulls Centrum Park was offered at 50 of 2,000 and the fee
 * looked entirely plausible (user-caught 2026-09-08).
 *
 * It has always been editable on the circuit registry. This is the same act
 * from the page where the figure is actually read.
 */
export async function updateRepresentedLightCount(
  circuitId: string,
  representedLightCount: number,
  note: string,
) {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid." };
  const isOps =
    actor.permissions.includes("manage_survey") && actor.permissions.includes("manage_pipeline");
  if (!isOps) {
    return {
      error:
        "Correcting the represented count is an operations lead action — it needs both pipeline and field-survey authority.",
    };
  }
  if (!note.trim()) {
    return { error: "Say where the corrected figure comes from — a change to a billed basis needs a stated source." };
  }

  const circuit = await db.circuit.findUnique({
    where: { id: circuitId },
    select: {
      id: true,
      meteredLightCount: true,
      representedLightCount: true,
      feeLines: { where: { calculation: { releasedAt: { not: null } } }, select: { id: true }, take: 1 },
      siteSurvey: {
        select: {
          pipeline: { select: { offers: { where: { status: { not: "draft" } }, select: { id: true }, take: 1 } } },
        },
      },
    },
  });
  if (!circuit) return { error: "Circuit not found." };

  const refusal = refuseRepresentedCount(representedLightCount, circuit.meteredLightCount);
  if (refusal) return { error: refusal };

  // GATE-02 / INV-02 — a figure a released calculation was computed on is not
  // restated here. The paths that do leave a record are a contract amendment
  // or a deviation review, the same call as voiding a billed circuit.
  if (circuit.feeLines.length > 0) {
    return {
      error:
        "This circuit has been billed on a released calculation — the represented count it was billed against cannot be restated. Raise a contract amendment or a deviation review instead.",
    };
  }
  // An offer the society has actually been shown was priced on the old figure.
  // Changing the basis underneath it would leave the paper and the record
  // disagreeing with nothing saying so; a counter-offer is the path that
  // versions it (FEAT-028-AC-5).
  if ((circuit.siteSurvey?.pipeline?.offers.length ?? 0) > 0) {
    return {
      error:
        "An offer has already been issued to the society on this figure. Counter it with the corrected terms rather than changing what the issued offer was priced on.",
    };
  }

  await db.circuit.update({ where: { id: circuitId }, data: { representedLightCount } });

  logger.info("circuit.represented_count_corrected", {
    circuitId,
    actorId: actor.id,
    from: circuit.representedLightCount,
    to: representedLightCount,
    meteredLightCount: circuit.meteredLightCount,
    note,
  });
  revalidatePath(`/admin/societies`);
  revalidatePath(`/admin/pipeline`);
  return {};
}
