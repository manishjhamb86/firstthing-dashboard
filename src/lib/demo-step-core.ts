/**
 * The demo commissioning steps that happen ON SITE — the meter install with
 * its load test, and the light replacement — as plain functions taking an
 * account already resolved from its row (2026-09-29).
 *
 * They lived in the circuit page's Server Action file. They are here so the
 * field app's sync endpoint can run EXACTLY the same step, not a copy: the
 * back office's actions resolve the session and call these; the sync endpoint
 * resolves its own session and calls these. They must NOT be exported from a
 * "use server" file — every export there is callable from a browser, and a
 * client could pass in any account.
 *
 * Both only SET values (a date, a load, per-line counts), so applying the
 * same input twice leaves the same state — which is what lets the field path
 * receipt them after the act (see src/app/api/field/sync/route.ts).
 */

import { revalidatePath } from "next/cache";
import { db } from "./db";
import type { Tx } from "./tx";
import { logger } from "./logger";
import { logChange } from "./change-log";
import { isDemoMode } from "./demo-mode";
import { refuseOrderedDate, surveyHappenedAt } from "./step-dates";
import { demoLockState, LOCKED_MESSAGE } from "./demo-lock";
import { dayMs } from "./demo-periods";
import { refreshDemoFromMeter } from "./demo-refresh";
import { LOAD_TOLERANCE_PCT, resyncCircuitFigures } from "./circuit-figures";
import { planSpanAssignment } from "./meter-installation";
import { expectedDisplayedLoadW } from "./circuit-load";
import { afterHistoryChange, applySpanPlan, lockedDemosTouched } from "./meter-history";
import { refuseMissingFollowUp, remainingLinesOf, type PartialLine, type RemainingLine } from "./demo-replacement-followup";
import type { Prisma } from "@prisma/client";

export type CoreOutcome = { ok?: true; error?: string; warning?: string };

export const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export const demoSelect = {
  id: true,
  circuitId: true,
  sequence: true,
  meteredLightCount: true,
  meterId: true,
  meterInstallationId: true,
  meterSkipped: true,
  meterInstalledAt: true,
  meterDisplayedLoad: true,
  loadDiscrepancyPct: true,
  loadValidationOverrideById: true,
  preFrom: true,
  preTo: true,
  postFrom: true,
  postTo: true,
  lightReplacementDate: true,
  replacementOwnerId: true,
  unlockedUntil: true,
  voidedAt: true,
  rejected: true,
  circuit: {
    select: {
      id: true,
      societyId: true,
      state: true,
      voidedAt: true,
      wattage: true,
      meteredLightCount: true,
      representedLightCount: true,
      devices: { select: { count: true, wattage: true } },
      society: { select: { name: true } },
      siteSurvey: {
        select: {
          createdAt: true,
          pipelineId: true,
          pipeline: {
            select: {
              surveyOwnerId: true,
              scheduledEvents: { where: { kind: "survey_visit" }, orderBy: { startAt: "asc" }, take: 1, select: { startAt: true } },
            },
          },
        },
      },
    },
  },
} as const;

export async function sharedInReport(demoId: string, pipelineId: string | null | undefined): Promise<boolean> {
  if (!pipelineId) return false;
  return (await db.demoReport.count({ where: { pipelineId, status: "shared", demoIds: { has: demoId } } })) > 0;
}

/** Load a demo and refuse if it is not editable now. */
export async function editableDemo(demoId: string, actorId: string, action: string) {
  const demo = await db.circuitDemo.findUnique({ where: { id: demoId }, select: demoSelect });
  if (!demo || demo.voidedAt) return { error: "That demo is no longer on record." } as const;
  if (demo.circuit.voidedAt) return { error: "That circuit has been removed." } as const;
  const lock = demoLockState({
    sharedInReport: await sharedInReport(demo.id, demo.circuit.siteSurvey?.pipelineId),
    unlockedUntil: demo.unlockedUntil,
    demoMode: await isDemoMode(),
    now: new Date(),
  });
  if (!lock.editable) {
    logger.warn("demo.edit_refused_locked", { actorId, demoId, action });
    return { error: LOCKED_MESSAGE } as const;
  }
  return { demo } as const;
}


export function pathOf(demo: { circuitId: string; circuit: { societyId: string } }) {
  return `/admin/societies/${demo.circuit.societyId}/circuits/${demo.circuitId}`;
}

export async function finish(tx: Tx, circuitId: string, actorId: string) {
  await resyncCircuitFigures(tx, circuitId, actorId);
}

// ── Meter install & load test ───────────────────────────────────────────────

/**
 * The step picks the meter (optional — an old paper demo is re-entered without
 * one) and the install date, and validates the displayed load. With a meter,
 * the step writes the meter HISTORY entry; correcting the date here moves it.
 */
export async function recordDemoMeterAs(admin: { id: string }, input: {
  demoId: string;
  meterId: string | null;
  installedOn: string;
  /** Watts shown on the meter; null only when no meter is used. */
  displayedLoad: number | null;
}): Promise<CoreOutcome> {
  const g = await editableDemo(input.demoId, admin.id, "meter");
  if ("error" in g) return { error: g.error };
  const demo = g.demo;
  const demoMode = await isDemoMode();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.installedOn)) return { error: "Pick the day the meter went in." };
  const at = new Date(`${input.installedOn}T00:00:00Z`);
  const surveyed = surveyHappenedAt({
    visitAt: demo.circuit.siteSurvey?.pipeline?.scheduledEvents[0]?.startAt ?? null,
    rowCreatedAt: demo.circuit.siteSurvey?.createdAt ?? null,
  });
  const ordered = refuseOrderedDate({ subject: "The meter install", date: at, now: new Date(), mustNotPrecede: [{ label: surveyed.label, date: surveyed.date }] });
  if (ordered) return { error: ordered };
  if (demo.preFrom && dayMs(at) >= dayMs(demo.preFrom)) return { error: "The pre-installation period has to start after the meter went in — move the period first." };
  if (demo.lightReplacementDate && dayMs(at) >= dayMs(demo.lightReplacementDate)) return { error: "The meter has to go in before the lights were replaced." };

  const useMeter = input.meterId !== null;
  let discrepancyPct: number | null = null;
  if (useMeter) {
    if (input.displayedLoad === null || !Number.isFinite(input.displayedLoad) || input.displayedLoad <= 0) {
      return { error: "Enter the load the meter displays, in watts — it is checked against the circuit's lights." };
    }
    // The lights on THIS demo's meter — the same figure the form states. The
    // circuit's own count can have moved since (a verified light-count
    // change), and a demo is measured on the lights it was run on.
    const theoretical = expectedDisplayedLoadW({ meteredLightCount: demo.meteredLightCount, wattage: demo.circuit.wattage, devices: demo.circuit.devices }).watts;
    discrepancyPct = (Math.abs(input.displayedLoad - theoretical) / theoretical) * 100;
  } else if (input.displayedLoad !== null && Number.isFinite(input.displayedLoad) && input.displayedLoad > 0) {
    // The lights on THIS demo's meter — the same figure the form states. The
    // circuit's own count can have moved since (a verified light-count
    // change), and a demo is measured on the lights it was run on.
    const theoretical = expectedDisplayedLoadW({ meteredLightCount: demo.meteredLightCount, wattage: demo.circuit.wattage, devices: demo.circuit.devices }).watts;
    discrepancyPct = (Math.abs(input.displayedLoad - theoretical) / theoretical) * 100;
  }

  // The history entry this pick writes: from the install date, on this circuit.
  let plan: ReturnType<typeof planSpanAssignment> | null = null;
  // Already recorded on this circuit that day (a second demo on the same
  // meter): link the entry that exists rather than splitting the history.
  const covering = useMeter
    ? await db.meterInstallation.findFirst({
        where: {
          meterId: input.meterId!,
          circuitId: demo.circuitId,
          installedAt: { lte: at },
          OR: [{ removedAt: null }, { removedAt: { gt: at } }],
          // The demo's own entry is rewritten to the new date, never linked.
          ...(demo.meterInstallationId ? { id: { not: demo.meterInstallationId } } : {}),
        },
        select: { id: true },
      })
    : null;
  if (useMeter && !covering) {
    const meter = await db.meterDevice.findUnique({ where: { id: input.meterId! }, select: { id: true, name: true, hasEnergySignal: true } });
    if (!meter) return { error: "That meter is no longer in the list." };
    if (!meter.hasEnergySignal) return { error: `${meter.name} reports no electricity datapoint — only a metering device can measure a circuit.` };
    const stays = await db.meterInstallation.findMany({
      where: { OR: [{ meterId: meter.id }, { circuitId: demo.circuitId }], ...(demo.meterInstallationId ? { id: { not: demo.meterInstallationId } } : {}) },
      select: { id: true, meterId: true, circuitId: true, societyId: true, installedAt: true, removedAt: true },
    });
    // The demo's own earlier entry is replaced wholesale, so it is left out.
    plan = planSpanAssignment({ meterId: meter.id, circuitId: demo.circuitId, from: at, to: null, stays });
    if ("error" in plan) return { error: plan.error };
    // Rewriting closed history (splitting it, deleting it, moving a start) is
    // a demo-mode act; a forward move — closing an open entry now — is not.
    const rewritesHistory = plan.changes.some((c) => c.kind !== "trim-end" || c.stay.removedAt !== null);
    if (rewritesHistory && !demoMode) {
      logger.warn("demo.meter_history_refused", { actorId: admin.id, demoId: demo.id, reason: "history_rewrite" });
      return { error: "That date would rewrite this meter's or this circuit's past history. Correcting past history is a demo-mode action — or pick a date after the meter's current entry began." };
    }
    const locked = await lockedDemosTouched(plan.changes.filter((c) => c.stay.circuitId !== demo.circuitId).map((c) => ({ circuitId: c.stay.circuitId, from: at, to: null })));
    if (locked.length > 0) return { error: `That would move readings under ${locked.join(", ")}, whose report has been shared. Unlock it first.` };
    const released = await db.meterReading.count({
      where: { circuitId: { in: plan.changes.map((c) => c.stay.circuitId) }, date: { gte: at }, usedInCalculationId: { not: null } },
    });
    if (released > 0) return { error: "Days after that date are on a released bill — the history cannot move them." };
  }

  const affected = await db.$transaction(
    async (tx) => {
      let circuitIds: string[] = [demo.circuitId];
      let installationId: string | null = covering?.id ?? null;
      if (demo.meterInstallationId && demo.meterInstallationId !== covering?.id) {
        const own = await tx.meterInstallation.findUnique({ where: { id: demo.meterInstallationId } });
        if (own) {
          await tx.meterInstallation.delete({ where: { id: own.id } });
          await logChange(tx, { entity: "meter_installation", entityId: own.id, kind: "history_edit", field: "replaced_by_demo_step", meterId: own.meterId, circuitId: own.circuitId, demoId: demo.id, oldValue: { installedAt: iso(own.installedAt), removedAt: iso(own.removedAt) }, actorId: admin.id });
          circuitIds.push(own.circuitId);
        }
      }
      if (plan && !("error" in plan)) {
        const res = await applySpanPlan(tx, plan, { actorId: admin.id, reason: `Demo ${demo.sequence} meter install` });
        circuitIds = circuitIds.concat(res.circuitIds);
        installationId = (await tx.meterInstallation.findFirst({ where: { meterId: input.meterId!, circuitId: demo.circuitId, installedAt: at }, select: { id: true } }))?.id ?? null;
      }
      await logChange(tx, {
        entity: "circuit_demo", entityId: demo.id, kind: "edit", field: "meter", circuitId: demo.circuitId, demoId: demo.id, actorId: admin.id,
        oldValue: { meterId: demo.meterId, meterInstalledAt: iso(demo.meterInstalledAt), displayedLoad: demo.meterDisplayedLoad },
        newValue: { meterId: input.meterId, meterInstalledAt: input.installedOn, displayedLoad: input.displayedLoad },
      });
      await tx.circuitDemo.update({
        where: { id: demo.id },
        data: {
          meterId: input.meterId,
          meterSkipped: !useMeter,
          meterInstallationId: installationId,
          meterInstalledAt: at,
          meterDisplayedLoad: input.displayedLoad,
          loadDiscrepancyPct: discrepancyPct,
          // A fresh load reading replaces any earlier override.
          loadValidationOverrideById: null,
          loadValidationOverrideReason: null,
        },
      });
      await refreshDemoFromMeter(tx, demo.id);
      await finish(tx, demo.circuitId, admin.id);
      return circuitIds;
    },
    { timeout: 60_000, maxWait: 20_000 },
  );
  if (useMeter) await afterHistoryChange(affected.filter((c) => c !== demo.circuitId), admin.id);
  logger.info("demo.meter_recorded", { actorId: admin.id, demoId: demo.id, meterId: input.meterId, installedOn: input.installedOn, discrepancyPct });
  revalidatePath(pathOf(demo));
  revalidatePath("/admin/meters");
  if (discrepancyPct !== null && discrepancyPct > LOAD_TOLERANCE_PCT) {
    // SAVED — a warning, not a refusal. The back office shows it as its
    // message; the field app must not treat a saved install as refused.
    return { ok: true, warning: `Saved, but the displayed load is ${discrepancyPct.toFixed(1)}% from the circuit's lights — outside ±${LOAD_TOLERANCE_PCT}%. Recheck the light count, wattage and anything else on the circuit, or operations overrides it with a reason.` };
  }
  return { ok: true };
}

// ── The light replacement ───────────────────────────────────────────────────

/**
 * What was done to one inventory line. `exclude` marks a fixture that stays on
 * the circuit unreplaced (no compatible device, or not part of the job): its
 * draw is subtracted from both the before and after averages when the
 * benchmark is worked out, and the reports say so (2026-09-26, user-specified).
 */
export type DemoReplacementLine = { lineId: string; replacementTypeId: string; count: number; wattage: number; exclude?: boolean };

/**
 * Record the replacement (the pivot day) — or correct it. The work has to be
 * handed to a crew and booked first; the day must fall after the pre period
 * and before the post period.
 */
export async function recordDemoReplacementAs(
  admin: { id: string },
  input: {
    demoId: string;
    replacedOn: string;
    lines?: DemoReplacementLine[];
    /** Required whenever a submitted line replaces fewer lights than it holds — see demo-replacement-followup.ts. */
    followUp?: { plan: "field_revisit" | "society_completes"; reason: string };
  },
): Promise<CoreOutcome> {
  const g = await editableDemo(input.demoId, admin.id, "replacement");
  if ("error" in g) return { error: g.error };
  const demo = g.demo;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.replacedOn)) return { error: "Pick the day the last light was replaced." };
  const date = new Date(`${input.replacedOn}T00:00:00Z`);
  const correcting = demo.lightReplacementDate !== null;
  if (!correcting) {
    if (!demo.replacementOwnerId) return { error: "Assign the replacement to a crew first — nobody has been asked to do this work." };
    const booked = await db.scheduledEvent.findFirst({ where: { demoId: demo.id, kind: "installation_day", status: "scheduled" }, select: { id: true } });
    if (!booked) return { error: "Book the replacement day with the society first — the date recorded here is the pivot day, left out of both periods." };
  }
  if (!demo.meterInstalledAt) return { error: "Record the meter install first." };
  if (date.getTime() > Date.now()) return { error: "The replacement cannot be dated in the future." };
  if (dayMs(date) <= dayMs(demo.meterInstalledAt)) return { error: "The lights cannot have been replaced on or before the day the meter went in." };
  if (demo.preTo && dayMs(date) <= dayMs(demo.preTo)) return { error: "The replacement has to come after the pre-installation period ends — move the period first." };
  if (demo.postFrom && dayMs(date) >= dayMs(demo.postFrom)) return { error: "The replacement has to come before the post-installation period starts — move the period first." };

  const devices = await db.circuitDevice.findMany({ where: { circuitId: demo.circuitId }, include: { deviceType: { include: { replacementOptions: true } } } });
  const byLine = new Map((input.lines ?? []).map((r) => [r.lineId, r]));
  // A correction may bring the lines too — "change the kept count from 8 to
  // 9" is a change to how many lights on a line were replaced (2026-09-27).
  // Without lines it only moves the date, as before.
  const withLines = devices.length > 0 && (!correcting || (input.lines ?? []).length > 0);
  if (withLines) {
    if ((input.lines ?? []).length > 0 && devices.every((line) => byLine.get(line.id)?.exclude)) {
      return { error: "At least one line has to be replaced — a demo with every fixture excluded measures no saving." };
    }
    for (const line of devices) {
      const r = byLine.get(line.id);
      if (!r) return { error: `Record what replaced the ${line.count} × ${line.deviceType.name} — every line needs its installed device, or mark it excluded from the benchmark.` };
      if (r.exclude) continue;
      if (!line.deviceType.replacementOptions.some((o) => o.replacementTypeId === r.replacementTypeId)) {
        return { error: `That device isn't in the compatibility list for ${line.deviceType.name}.` };
      }
      if (!Number.isInteger(r.count) || r.count < 1) return { error: `Replaced count for ${line.deviceType.name} must be a whole number.` };
      if (r.count > line.count) return { error: `The ${line.deviceType.name} line holds ${line.count} lights — no more than that can have been replaced.` };
      if (!Number.isFinite(r.wattage) || r.wattage <= 0 || r.wattage > 2000) return { error: `Installed wattage for ${line.deviceType.name} must be between 1 and 2000 W.` };
    }
  }

  // Some lights left on the circuit, unreplaced — somebody has to finish
  // them, and it has to be said who (2026-10-06, user-asked).
  const partialLines: PartialLine[] = withLines
    ? devices
        .filter((line) => !byLine.get(line.id)?.exclude)
        .map((line) => ({ lineId: line.id, deviceTypeName: line.deviceType.name, lineCount: line.count, replacedCount: byLine.get(line.id)!.count }))
    : [];
  const remaining: RemainingLine[] = remainingLinesOf(partialLines);
  const followUpError = refuseMissingFollowUp(remaining, input.followUp ?? null);
  if (followUpError) return { error: followUpError };

  await db.$transaction(async (tx) => {
    if (withLines) {
      for (const line of devices) {
        const r = byLine.get(line.id)!;
        if (r.exclude) {
          await tx.circuitDevice.update({
            where: { id: line.id },
            data: { excludedFromCalculation: true, replacementTypeId: null, replacementCount: null, replacementWattage: null, replacedAt: null, replacedById: admin.id },
          });
        } else {
          await tx.circuitDevice.update({
            where: { id: line.id },
            data: { excludedFromCalculation: false, replacementTypeId: r.replacementTypeId, replacementCount: r.count, replacementWattage: r.wattage, replacedAt: date, replacedById: admin.id },
          });
        }
        if (line.excludedFromCalculation !== Boolean(r.exclude)) {
          await logChange(tx, { entity: "circuit_device", entityId: line.id, kind: "edit", field: "excludedFromCalculation", circuitId: demo.circuitId, demoId: demo.id, oldValue: line.excludedFromCalculation, newValue: Boolean(r.exclude), actorId: admin.id });
        }
        const newReplaced = r.exclude ? null : r.count;
        if (correcting && line.replacementCount !== newReplaced) {
          await logChange(tx, { entity: "circuit_device", entityId: line.id, kind: "edit", field: "replacementCount", circuitId: demo.circuitId, demoId: demo.id, oldValue: line.replacementCount, newValue: newReplaced, actorId: admin.id });
        }
      }
    } else {
      await tx.circuitDevice.updateMany({ where: { circuitId: demo.circuitId, replacedAt: demo.lightReplacementDate }, data: { replacedAt: date } });
    }
    await tx.circuitDemo.update({ where: { id: demo.id }, data: { lightReplacementDate: date } });
    await logChange(tx, { entity: "circuit_demo", entityId: demo.id, kind: "edit", field: "lightReplacementDate", circuitId: demo.circuitId, demoId: demo.id, oldValue: iso(demo.lightReplacementDate), newValue: input.replacedOn, actorId: admin.id });

    if (remaining.length > 0 && input.followUp?.plan === "society_completes") {
      // The field-revisit path raises no row of its own — correcting the
      // line's count up to the full total (below) is what closes that story.
      await tx.demoReplacementFollowUp.create({
        data: {
          demoId: demo.id,
          circuitId: demo.circuitId,
          societyId: demo.circuit.societyId,
          remaining: remaining as unknown as Prisma.InputJsonValue,
          plan: "society_completes",
          reason: input.followUp.reason.trim(),
          raisedById: admin.id,
        },
      });
      logger.info("demo.replacement_followup_raised", { demoId: demo.id, actorId: admin.id, remaining });
    } else if (correcting && remaining.length === 0) {
      // Every line is now fully replaced — a field crew's return visit closes
      // whatever was left open, with no separate "mark done" button needed.
      const open = await tx.demoReplacementFollowUp.findFirst({ where: { demoId: demo.id, completedAt: null, voidedAt: null } });
      if (open) {
        await tx.demoReplacementFollowUp.update({
          where: { id: open.id },
          data: { completedAt: new Date(), completedByAdminId: admin.id, completionNote: "All lines corrected to the full count." },
        });
        logger.info("demo.replacement_followup_closed_by_correction", { demoId: demo.id, followUpId: open.id, actorId: admin.id });
      }
    }

    await finish(tx, demo.circuitId, admin.id);
  });
  logger.info(correcting ? "demo.replacement_corrected" : "demo.replacement_recorded", {
    actorId: admin.id,
    demoId: demo.id,
    replacedOn: input.replacedOn,
    excludedLines: (input.lines ?? []).filter((l) => l.exclude).map((l) => l.lineId),
  });
  revalidatePath(pathOf(demo));
  return { ok: true };
}
