"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { resolveAdmin } from "@/lib/admin-permissions";
import { rederiveInvoiceMonthsAfterRescale } from "@/lib/invoice-rederive";
import { logger } from "@/lib/logger";
import { isDemoMode } from "@/lib/demo-mode";
import { REFUSAL_MESSAGE, refuseRescale, refuseVoid, rescaleBaseline } from "@/lib/benchmark-rescale";
import { utcMidnight as startOfDayUTC, validateDeviceLine } from "@/lib/circuit-load";
import { requireSuperApproval } from "@/lib/pending-approval";

export type RescaleResult = { error?: string };

/**
 * A genuinely different fixture folded into the same count change — the
 * load inventory is LOCKED once the meter is installed (addCircuitDevice
 * refuses outright outside demo mode), so this is the one place left that
 * can record it once a circuit is commissioned. Created `excludedFromCalculation`
 * — it is on the circuit and the meter sees it, but it is not part of the
 * uniform population `newLightCount` rescales, same rule an unreplaced
 * surface light already gets.
 */
type NewExcludedLine = { deviceTypeId: string; count: number; wattage: number; hoursPerDay: number; note?: string };

async function validateNewExcludedLine(line: NewExcludedLine): Promise<string | null> {
  const lineError = validateDeviceLine(line);
  if (lineError) return lineError;
  const type = await db.deviceType.findUnique({ where: { id: line.deviceTypeId } });
  if (!type || !type.active || type.role !== "original") {
    return "Pick the different fixture from the catalog — if it's missing, ops can add it there.";
  }
  return null;
}

// FEAT-041-AC-4 — PER-01 only, via this codebase's standing technical proxy
// (both manage_survey and manage_pipeline). Refuses by RETURNING: a Server
// Action that throws reaches the browser as an opaque digest in production,
// so the operator would be told nothing at all.
async function requireRescaleOps(): Promise<{ error: string } | { actorId: string; actorEmail: string }> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };
  if (!admin.permissions.includes("manage_survey") || !admin.permissions.includes("manage_pipeline")) {
    return {
      error:
        "Recording or voiding a light-count change is an operations lead action. It needs both pipeline and field-survey authority.",
    };
  }
  return { actorId: admin.id, actorEmail: admin.email };
}

// FEAT-041 — record a verified light-count change and the deterministic
// baseline rescale it triggers (CON-10), as a distinct timestamped event
// (INV-07). A thin shell around src/lib/benchmark-rescale.ts, which holds
// the actual rule and is where the unit tests point.
export async function recordLightCountChange(
  circuitId: string,
  input: {
    newLightCount: number;
    verificationNote: string;
    verificationPhotoUrl?: string;
    effectiveDate: string;
    sameWattageConfirmed: boolean;
    /** Set when sameWattageConfirmed is false — the different fixture,
     *  recorded as its own excluded line rather than folded into the count. */
    newExcludedLine?: NewExcludedLine;
  },
): Promise<RescaleResult> {
  // PER-04 can read the circuit but not rescale it.
  const gate = await requireRescaleOps();
  if ("error" in gate) return gate;
  const session = { user: { id: gate.actorId } };

  const circuit = await db.circuit.findUnique({ where: { id: circuitId } });
  if (!circuit) return { error: "Circuit not found." };

  const effectiveDate = input.effectiveDate ? startOfDayUTC(new Date(input.effectiveDate)) : null;

  if (input.newExcludedLine) {
    const lineError = await validateNewExcludedLine(input.newExcludedLine);
    if (lineError) return { error: lineError };
  }

  const refusal = refuseRescale({
    commissionedBaseline: circuit.preInstallBaseline,
    currentLightCount: circuit.meteredLightCount,
    newLightCount: input.newLightCount,
    verificationNote: input.verificationNote,
    effectiveDate,
    compositionHandled: input.sameWattageConfirmed || !!input.newExcludedLine,
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

  const approval = await requireSuperApproval({
    actorId: gate.actorId,
    actorEmail: gate.actorEmail,
    kind: "recordLightCountChange",
    summary: `Record a light-count change on circuit ${circuitId} — ${circuit.meteredLightCount} → ${input.newLightCount} lights, effective ${input.effectiveDate}${input.newExcludedLine ? ", plus a different fixture recorded on the load inventory" : ""}`,
    societyId: circuit.societyId,
    args: { circuitId, input },
  });
  if (approval) return approval;

  // The event and the circuit's current count move together — a count
  // without its event, or an event without the count, would each leave the
  // audit trail lying about the other. A new excluded line (a genuinely
  // different fixture, not part of the uniform population being rescaled)
  // moves with them in the same transaction — otherwise a failure partway
  // through could leave the rescale recorded with no trace of why the
  // circuit's real fixture count no longer matches it. Callback-style
  // (not the array form every other transaction here uses) because the new
  // device line has to reference the event's own real id — the whole point
  // of recording WHICH rescale introduced it, not just THAT one did.
  await db.$transaction(async (tx) => {
    const event = await tx.benchmarkRescaleEvent.create({
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
    });
    if (input.newExcludedLine) {
      await tx.circuitDevice.create({
        data: {
          circuitId,
          deviceTypeId: input.newExcludedLine.deviceTypeId,
          count: input.newExcludedLine.count,
          wattage: input.newExcludedLine.wattage,
          hoursPerDay: input.newExcludedLine.hoursPerDay,
          note: input.newExcludedLine.note?.trim() || null,
          excludedFromCalculation: true,
          recordedById: session.user.id,
          addedViaRescaleEventId: event.id,
        },
      });
    }
    // meteredLightCount is current state and does move. preInstallBaseline
    // is deliberately NOT touched: it stays as commissioned forever, and
    // the baseline in force is replayed from the events (ADR-005's
    // versioned-not-mutated rule, and what makes FEAT-041-AC-2 true by
    // construction). representedLightCount is left alone — CON-11 scopes
    // it to the light *type*, so it changes only if the society-wide count
    // of that type changed too, which is FEAT-040's config edit.
    await tx.circuit.update({
      where: { id: circuitId },
      data: { meteredLightCount: input.newLightCount },
    });
  });

  logger.info("circuit.benchmark_rescaled", {
    actorId: session.user.id,
    circuitId,
    previousLightCount: circuit.meteredLightCount,
    newLightCount: input.newLightCount,
    previousBaseline,
    rescaledBaseline,
    effectiveDate: effectiveDate!.toISOString(),
    newExcludedLine: input.newExcludedLine
      ? { deviceTypeId: input.newExcludedLine.deviceTypeId, count: input.newExcludedLine.count }
      : null,
  });

  // The society's published months from the effective month on follow the
  // new baseline — the dashboard reads those, not the circuit.
  await rederiveAfter(circuitId, effectiveDate!, gate.actorId);
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

  const approval = await requireSuperApproval({
    actorId: gate.actorId,
    actorEmail: gate.actorEmail,
    kind: "voidRescaleEvent",
    summary: `Void a light-count change on circuit ${event.circuitId} — was ${event.previousLightCount} → ${event.newLightCount} — ${reason.trim()}`,
    societyId: event.circuit.societyId,
    args: { eventId, reason },
  });
  if (approval) return approval;

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

  await rederiveAfter(event.circuitId, event.effectiveDate, gate.actorId);
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
  input: {
    newLightCount: number;
    verificationNote: string;
    effectiveDate: string;
    reason: string;
    sameWattageConfirmed: boolean;
  },
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

  // A correction that corrects nothing must be refused, or it writes a
  // no-op duplicate and voids a perfectly good entry to do it.
  //
  // `refuseRescale` below cannot catch this: it compares the new count to the
  // entry's PREVIOUS count (the state being scaled from), so re-submitting the
  // entry's own current count sails through as a legitimate change. The check
  // has to be against what this entry already says. All three editable fields
  // count — moving only the date or fixing only the verification note is a
  // real correction.
  const unchanged =
    input.newLightCount === event.newLightCount &&
    input.verificationNote.trim() === event.verificationNote &&
    effectiveDate != null &&
    effectiveDate.getTime() === event.effectiveDate.getTime();
  if (unchanged) {
    logger.warn("circuit.rescale_correction_refused", {
      actorId: gate.actorId,
      eventId,
      reason: "no-change",
    });
    return {
      error:
        "Nothing was changed — this entry already reads that count, date and verification. Change a value, or use Void to strike the entry out.",
    };
  }

  // The corrected entry scales from the SAME "previous" state as the entry it
  // replaces, not from the wrong figure that entry produced — otherwise the
  // mistake compounds instead of being undone.
  const refusal = refuseRescale({
    commissionedBaseline: event.previousBaseline,
    currentLightCount: event.previousLightCount,
    newLightCount: input.newLightCount,
    verificationNote: input.verificationNote,
    effectiveDate,
    compositionHandled: input.sameWattageConfirmed,
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

  const approval = await requireSuperApproval({
    actorId: gate.actorId,
    actorEmail: gate.actorEmail,
    kind: "correctRescaleEvent",
    summary: `Correct a light-count change on circuit ${event.circuitId} — ${event.newLightCount} → ${input.newLightCount} lights — ${input.reason.trim()}`,
    societyId: event.circuit.societyId,
    args: { eventId, input },
  });
  if (approval) return approval;

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

  // A correction can move the effective date either way — start from the earlier.
  await rederiveAfter(event.circuitId, effectiveDate! < event.effectiveDate ? effectiveDate! : event.effectiveDate, gate.actorId);
  revalidatePath(`/admin/societies/${event.circuit.societyId}/circuits/${event.circuitId}`);
  revalidatePath(`/admin/societies/${event.circuit.societyId}/circuits`);
  return {};
}

/** Re-derive published months after a rescale; a failure is logged, never shown as the rescale failing. */
async function rederiveAfter(circuitId: string, from: Date, actorId: string): Promise<void> {
  try {
    const earliest = from.toISOString().slice(0, 7);
    await rederiveInvoiceMonthsAfterRescale(circuitId, earliest, actorId);
    revalidatePath("/portal");
    revalidatePath("/portal/electricity");
    revalidatePath("/admin/billing");
  } catch (err) {
    logger.warn("billing.rederive_after_rescale_failed", { circuitId, error: String(err) });
  }
}

/**
 * Remove a light-count change completely — before go-live (demo mode), the
 * user's rule for records entered by mistake (2026-09-27: "give option to
 * remove this record, and make sure removing it reflects everywhere its value
 * is used").
 *
 * Everything that reads a rescale replays the surviving entries — the baseline
 * in force on any date, the light-count history, the portal, monitoring, band
 * alerts and the invoice stats — so a removed entry stops counting the moment
 * it is gone. The two stored consequences are re-derived here, as voiding
 * does: the circuit's metered count (from the entries that remain) and the
 * released invoice months from its effective month on. Outside demo mode,
 * Void is the way to take an entry out and keep the record.
 */
export async function removeRescaleEvent(eventId: string): Promise<RescaleResult> {
  const gate = await requireRescaleOps();
  if ("error" in gate) return gate;
  if (!(await isDemoMode())) {
    logger.warn("circuit.rescale_remove_refused", { actorId: gate.actorId, eventId, reason: "not_demo_mode" });
    return { error: "Removing an entry completely is only available in demo mode, before go-live. Void it instead — it stops counting and stays on record." };
  }
  const event = await db.benchmarkRescaleEvent.findUnique({
    where: { id: eventId },
    include: { circuit: { select: { id: true, societyId: true } } },
  });
  if (!event) return { error: "That entry no longer exists." };

  const survivors = await db.benchmarkRescaleEvent.findMany({
    where: { circuitId: event.circuitId, voidedAt: null, id: { not: eventId } },
    orderBy: { effectiveDate: "asc" },
  });
  // The count as the surviving entries leave it; with none, as commissioned —
  // the earliest entry's own "previous" count.
  const earliest = await db.benchmarkRescaleEvent.findFirst({
    where: { circuitId: event.circuitId },
    orderBy: { effectiveDate: "asc" },
    select: { previousLightCount: true },
  });
  const restoredCount = survivors.length
    ? survivors[survivors.length - 1].newLightCount
    : (earliest?.previousLightCount ?? event.previousLightCount);

  await db.$transaction([
    // An entry this one corrected (or that corrected it) points at it; the
    // link goes with it.
    db.benchmarkRescaleEvent.updateMany({ where: { correctedByEventId: eventId }, data: { correctedByEventId: null } }),
    db.benchmarkRescaleEvent.delete({ where: { id: eventId } }),
    db.circuit.update({ where: { id: event.circuitId }, data: { meteredLightCount: restoredCount } }),
  ]);
  logger.info("circuit.rescale_removed", { actorId: gate.actorId, circuitId: event.circuitId, restoredCount });

  await rederiveAfter(event.circuitId, event.effectiveDate, gate.actorId);
  revalidatePath(`/admin/societies/${event.circuit.societyId}/circuits/${event.circuitId}`);
  revalidatePath(`/admin/societies/${event.circuit.societyId}/circuits`);
  revalidatePath(`/admin/live-monitoring/${event.circuitId}`);
  return {};
}

/**
 * Remove a fixture added via a light-count change — the one gap the feature
 * shipped with (2026-10-26, user-caught): the load inventory's own "Remove"
 * is gated to BEFORE the meter is installed, same as "Add a device line",
 * so once a circuit is commissioned there was no way back for a line added
 * by mistake through this path. Scoped tightly to exactly that case —
 * `addedViaRescaleEventId` has to be set, so this can never touch a
 * genuine demo-era line (that stays Correct count / Correct device only,
 * never removable once commissioned — a stronger rule, deliberately left
 * alone). A hard delete, matching removeCircuitDevice's own existing
 * behaviour for this model (CircuitDevice carries no void fields at all) —
 * the reason is what survives, in the log line, not the row.
 */
export async function removeRescaleAddedDevice(lineId: string, reason: string): Promise<RescaleResult> {
  const gate = await requireRescaleOps();
  if ("error" in gate) return gate;
  if (!reason.trim()) {
    logger.warn("inventory.rescale_added_device_remove_refused", { actorId: gate.actorId, lineId, reason: "no-reason" });
    return { error: "Record why this fixture is being removed." };
  }
  const line = await db.circuitDevice.findUnique({
    where: { id: lineId },
    include: { circuit: { select: { id: true, societyId: true } } },
  });
  if (!line) return { error: "That line no longer exists." };
  if (!line.addedViaRescaleEventId) {
    return {
      error:
        "This line wasn't added through a light-count change, so it can't be removed this way — use Correct count or Correct device instead.",
    };
  }
  await db.circuitDevice.delete({ where: { id: lineId } });
  logger.info("inventory.rescale_added_device_removed", {
    actorId: gate.actorId,
    lineId,
    circuitId: line.circuitId,
    deviceTypeId: line.deviceTypeId,
    count: line.count,
    reason: reason.trim(),
  });
  revalidatePath(`/admin/societies/${line.circuit.societyId}/circuits/${line.circuitId}`);
  return {};
}
