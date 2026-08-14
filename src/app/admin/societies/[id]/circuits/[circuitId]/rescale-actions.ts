"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";
import { REFUSAL_MESSAGE, refuseRescale, rescaleBaseline } from "@/lib/benchmark-rescale";
import { startOfDayUTC } from "@/lib/monitoring-window";

// FEAT-041 — record a verified light-count change and the deterministic
// baseline rescale it triggers (CON-10), as a distinct timestamped event
// (INV-07). A thin shell around src/lib/benchmark-rescale.ts, which holds
// the actual rule and is where the unit tests point.
export async function recordLightCountChange(
  circuitId: string,
  input: { newLightCount: number; verificationNote: string; verificationPhotoUrl?: string; effectiveDate: string },
) {
  // FEAT-041-AC-4 — PER-01 only. Same "PER-01 specifically" technical proxy
  // this milestone uses everywhere else (both manage_survey and
  // manage_pipeline), recorded once in PROJECT_CONTEXT.md rather than
  // re-derived per site. PER-04 can read the circuit but not rescale it.
  await requireAdminPermission("manage_survey");
  const session = await requireAdminPermission("manage_pipeline");

  const circuit = await db.circuit.findUnique({ where: { id: circuitId } });
  if (!circuit) return { error: "Circuit not found." };

  const effectiveDate = input.effectiveDate ? startOfDayUTC(new Date(input.effectiveDate)) : null;

  const refusal = refuseRescale({
    commissionedBaseline: circuit.preInstallBaseline,
    currentLightCount: circuit.meteredLightCount,
    newLightCount: input.newLightCount,
    verificationNote: input.verificationNote,
    effectiveDate,
  });
  if (refusal) {
    logger.warn("circuit.rescale_refused", {
      actorId: session.user.id,
      circuitId,
      reason: refusal,
      newLightCount: input.newLightCount,
    });
    return { error: REFUSAL_MESSAGE[refusal] };
  }

  // Non-null past refuseRescale, which checks both.
  const previousBaseline = circuit.preInstallBaseline!;
  const rescaledBaseline = rescaleBaseline(previousBaseline, circuit.meteredLightCount, input.newLightCount);

  // The event and the circuit's current count move together — a count
  // without its event, or an event without the count, would each leave the
  // audit trail lying about the other.
  await db.$transaction([
    db.benchmarkRescaleEvent.create({
      data: {
        circuitId,
        previousLightCount: circuit.meteredLightCount,
        newLightCount: input.newLightCount,
        previousBaseline,
        rescaledBaseline,
        verificationNote: input.verificationNote.trim(),
        verificationPhotoUrl: input.verificationPhotoUrl?.trim() || null,
        effectiveDate: effectiveDate!,
        recordedById: session.user.id,
      },
    }),
    // meteredLightCount is current state and does move. preInstallBaseline
    // is deliberately NOT touched: it stays as commissioned forever, and
    // the baseline in force is replayed from the events (ADR-005's
    // versioned-not-mutated rule, and what makes FEAT-041-AC-2 true by
    // construction). representedLightCount is left alone — CON-11 scopes
    // it to the light *type*, so it changes only if the society-wide count
    // of that type changed too, which is FEAT-040's config edit.
    db.circuit.update({
      where: { id: circuitId },
      data: { meteredLightCount: input.newLightCount },
    }),
  ]);

  logger.info("circuit.benchmark_rescaled", {
    actorId: session.user.id,
    circuitId,
    previousLightCount: circuit.meteredLightCount,
    newLightCount: input.newLightCount,
    previousBaseline,
    rescaledBaseline,
    effectiveDate: effectiveDate!.toISOString(),
  });

  revalidatePath(`/admin/societies/${circuit.societyId}/circuits/${circuitId}`);
  revalidatePath(`/admin/societies/${circuit.societyId}/circuits`);
  return {};
}
