"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { resolveAdmin } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";
import { REFUSAL_MESSAGE, refuseRescale, refuseVoid, rescaleBaseline } from "@/lib/benchmark-rescale";
import { startOfDayUTC } from "@/lib/monitoring-window";

export type RescaleResult = { error?: string };

// FEAT-041-AC-4 — PER-01 only, via this codebase's standing technical proxy
// (both manage_survey and manage_pipeline). Refuses by RETURNING: a Server
// Action that throws reaches the browser as an opaque digest in production,
// so the operator would be told nothing at all.
async function requireRescaleOps(): Promise<{ error: string } | { actorId: string }> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };
  if (!admin.permissions.includes("manage_survey") || !admin.permissions.includes("manage_pipeline")) {
    return {
      error:
        "Recording or voiding a light-count change is an operations lead action. It needs both pipeline and field-survey authority.",
    };
  }
  return { actorId: admin.id };
}

// FEAT-041 — record a verified light-count change and the deterministic
// baseline rescale it triggers (CON-10), as a distinct timestamped event
// (INV-07). A thin shell around src/lib/benchmark-rescale.ts, which holds
// the actual rule and is where the unit tests point.
export async function recordLightCountChange(
  circuitId: string,
  input: { newLightCount: number; verificationNote: string; verificationPhotoUrl?: string; effectiveDate: string },
): Promise<RescaleResult> {
  // PER-04 can read the circuit but not rescale it.
  const gate = await requireRescaleOps();
  if ("error" in gate) return gate;
  const session = { user: { id: gate.actorId } };

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

/**
 * Soft-delete a rescale entry (the user-facing "Void").
 *
 * Not a hard delete and not an edit. These rows replay into the baseline a
 * society is billed on, so:
 *  - editing one restates a figure someone was already billed on (INV-02),
 *  - deleting one erases the fact that the wrong baseline was ever in force.
 * Voiding does neither. The row stays visible, struck through, with its owner
 * and reason, and stops counting toward `effectiveBaselineAt`.
 *
 * The circuit's current `meteredLightCount` is re-derived from whatever the
 * surviving events say — otherwise voiding the newest entry would leave the
 * count sitting at a value no live event supports.
 */
export async function voidRescaleEvent(eventId: string, reason: string): Promise<RescaleResult> {
  const gate = await requireRescaleOps();
  if ("error" in gate) return gate;

  const event = await db.benchmarkRescaleEvent.findUnique({
    where: { id: eventId },
    include: { circuit: { select: { id: true, societyId: true, meteredLightCount: true } } },
  });
  if (!event) return { error: "That entry no longer exists." };

  const refusal = refuseVoid({ reason, alreadyVoided: !!event.voidedAt });
  if (refusal) {
    logger.warn("circuit.rescale_void_refused", { actorId: gate.actorId, eventId, reason: refusal });
    return { error: refusal };
  }

  const survivors = await db.benchmarkRescaleEvent.findMany({
    where: { circuitId: event.circuitId, voidedAt: null, id: { not: eventId } },
    orderBy: { effectiveDate: "asc" },
  });
  const circuit = await db.circuit.findUnique({
    where: { id: event.circuitId },
    select: { preInstallBaseline: true },
  });

  // With no surviving events the count returns to the earliest event's own
  // "previous" value — the count as commissioned. `preInstallBaseline` is
  // untouched throughout, as ever.
  const restoredCount = survivors.length
    ? survivors[survivors.length - 1].newLightCount
    : event.previousLightCount;

  await db.$transaction([
    db.benchmarkRescaleEvent.update({
      where: { id: eventId },
      data: { voidedAt: new Date(), voidedById: gate.actorId, voidReason: reason.trim() },
    }),
    db.circuit.update({ where: { id: event.circuitId }, data: { meteredLightCount: restoredCount } }),
  ]);

  logger.info("circuit.rescale_voided", {
    actorId: gate.actorId,
    eventId,
    circuitId: event.circuitId,
    voidedBaseline: event.rescaledBaseline,
    restoredCount,
    effectiveBaselineNow: survivors.length
      ? survivors[survivors.length - 1].rescaledBaseline
      : (circuit?.preInstallBaseline ?? null),
  });

  revalidatePath(`/admin/societies/${event.circuit.societyId}/circuits/${event.circuitId}`);
  revalidatePath(`/admin/societies/${event.circuit.societyId}/circuits`);
  return {};
}

/**
 * The "Edit" the operator actually wants, built the only way it can be built
 * safely: void the wrong entry and write the corrected one in a single
 * transaction, linked by `correctedByEventId`.
 *
 * The visible outcome is an edited entry; the record underneath still shows
 * what was originally entered, who changed it and why. The corrected event is
 * computed from the same `rescaleBaseline` formula as any other — a
 * correction is never a chance to type a baseline in by hand.
 */
export async function correctRescaleEvent(
  eventId: string,
  input: { newLightCount: number; verificationNote: string; effectiveDate: string; reason: string },
): Promise<RescaleResult> {
  const gate = await requireRescaleOps();
  if ("error" in gate) return gate;

  const event = await db.benchmarkRescaleEvent.findUnique({
    where: { id: eventId },
    include: { circuit: { select: { id: true, societyId: true, preInstallBaseline: true } } },
  });
  if (!event) return { error: "That entry no longer exists." };
  if (event.voidedAt) return { error: "This entry has already been voided." };
  if (!input.reason.trim()) {
    // Logged, like every other refusal here, so a verification pass can tell
    // "the server refused" apart from "the client never submitted".
    logger.warn("circuit.rescale_correction_refused", {
      actorId: gate.actorId,
      eventId,
      reason: "no-reason",
    });
    return { error: "Record why this entry is being corrected." };
  }

  const effectiveDate = input.effectiveDate ? startOfDayUTC(new Date(input.effectiveDate)) : null;

  // The corrected entry scales from the SAME "previous" state as the entry it
  // replaces, not from the wrong figure that entry produced — otherwise the
  // mistake compounds instead of being undone.
  const refusal = refuseRescale({
    commissionedBaseline: event.previousBaseline,
    currentLightCount: event.previousLightCount,
    newLightCount: input.newLightCount,
    verificationNote: input.verificationNote,
    effectiveDate,
  });
  if (refusal) {
    logger.warn("circuit.rescale_correction_refused", { actorId: gate.actorId, eventId, reason: refusal });
    return { error: REFUSAL_MESSAGE[refusal] };
  }

  const rescaledBaseline = rescaleBaseline(
    event.previousBaseline,
    event.previousLightCount,
    input.newLightCount,
  );

  await db.$transaction(async (tx) => {
    const replacement = await tx.benchmarkRescaleEvent.create({
      data: {
        circuitId: event.circuitId,
        previousLightCount: event.previousLightCount,
        newLightCount: input.newLightCount,
        previousBaseline: event.previousBaseline,
        rescaledBaseline,
        verificationNote: input.verificationNote.trim(),
        verificationPhotoUrl: event.verificationPhotoUrl,
        effectiveDate: effectiveDate!,
        recordedById: gate.actorId,
      },
    });
    await tx.benchmarkRescaleEvent.update({
      where: { id: eventId },
      data: {
        voidedAt: new Date(),
        voidedById: gate.actorId,
        voidReason: input.reason.trim(),
        correctedByEventId: replacement.id,
      },
    });

    const survivors = await tx.benchmarkRescaleEvent.findMany({
      where: { circuitId: event.circuitId, voidedAt: null },
      orderBy: { effectiveDate: "asc" },
    });
    await tx.circuit.update({
      where: { id: event.circuitId },
      data: { meteredLightCount: survivors[survivors.length - 1].newLightCount },
    });
  });

  logger.info("circuit.rescale_corrected", {
    actorId: gate.actorId,
    eventId,
    circuitId: event.circuitId,
    wasLightCount: event.newLightCount,
    nowLightCount: input.newLightCount,
    wasBaseline: event.rescaledBaseline,
    nowBaseline: rescaledBaseline,
  });

  revalidatePath(`/admin/societies/${event.circuit.societyId}/circuits/${event.circuitId}`);
  revalidatePath(`/admin/societies/${event.circuit.societyId}/circuits`);
  return {};
}
