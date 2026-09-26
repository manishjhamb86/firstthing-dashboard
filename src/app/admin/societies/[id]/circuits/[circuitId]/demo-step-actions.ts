"use server";

/**
 * Demo commissioning, one demo at a time (2026-09-26, user-specified).
 *
 * Every demo walks the full step set, and every step here writes to the DEMO,
 * not the circuit. Each action: resolve the account from its row, check the
 * permission, check the demo is editable (open until its report is shared,
 * always in demo mode, or unlocked for correction), log the old value, write,
 * and re-derive the circuit's figures through the one writer. Refusals return
 * a sentence — never a throw, which production turns into an opaque digest.
 */

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import type { Tx } from "@/lib/tx";
import { resolveAdmin } from "@/lib/admin-permissions";
import { canOwn, teamMeta } from "@/lib/admin-teams";
import { eventTitle } from "@/lib/schedule";
import { logger } from "@/lib/logger";
import { logChange } from "@/lib/change-log";
import { isDemoMode } from "@/lib/demo-mode";
import { scheduleJob } from "@/lib/jobs";
import { MAX_DEMOS_PER_CIRCUIT } from "@/lib/deal-scope";
import { refuseOrderedDate, surveyHappenedAt } from "@/lib/step-dates";
import { demoLockState, LOCKED_MESSAGE, refuseUnlock, unlockUntil } from "@/lib/demo-lock";
import { dayMs, periodDates, periodOfDay, refuseDemoPeriods, type PeriodInput } from "@/lib/demo-periods";
import { acceptanceOf, refuseAcceptance } from "@/lib/demo-acceptance";
import { refreshDemoFromMeter } from "@/lib/demo-refresh";
import { LOAD_TOLERANCE_PCT, resyncCircuitFigures } from "@/lib/circuit-figures";
import { planSpanAssignment } from "@/lib/meter-installation";
import { afterHistoryChange, applySpanPlan, lockedDemosTouched } from "@/lib/meter-history";
import { generateDemoReportInternal } from "@/app/admin/pipeline/[id]/report/actions";

type Outcome = { ok?: true; error?: string };

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const isOps = (p: string[]) => p.includes("manage_survey") && p.includes("manage_pipeline");

async function actor(permission: "field" | "ops") {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." } as const;
  const p = admin.permissions as string[];
  if (permission === "field" && !p.includes("manage_survey")) return { error: "Demo commissioning is a field-survey action." } as const;
  if (permission === "ops" && !isOps(p)) return { error: "This is an operations lead action." } as const;
  return { admin, perms: p } as const;
}

const demoSelect = {
  id: true,
  circuitId: true,
  sequence: true,
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

async function sharedInReport(demoId: string, pipelineId: string | null | undefined): Promise<boolean> {
  if (!pipelineId) return false;
  return (await db.demoReport.count({ where: { pipelineId, status: "shared", demoIds: { has: demoId } } })) > 0;
}

/** Load a demo and refuse if it is not editable now. */
async function editableDemo(demoId: string, actorId: string, action: string) {
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

function pathOf(demo: { circuitId: string; circuit: { societyId: string } }) {
  return `/admin/societies/${demo.circuit.societyId}/circuits/${demo.circuitId}`;
}

async function finish(tx: Tx, circuitId: string, actorId: string) {
  await resyncCircuitFigures(tx, circuitId, actorId);
}

// ── Start a demo ────────────────────────────────────────────────────────────

export async function startDemo(input: { circuitId: string; combine: "batch" | "rerun"; meteredLightCount?: number; note?: string }): Promise<Outcome & { demoId?: string }> {
  const a = await actor("field");
  if ("error" in a) return { error: a.error };
  const circuit = await db.circuit.findUnique({
    where: { id: input.circuitId },
    select: { id: true, societyId: true, voidedAt: true, state: true, meteredLightCount: true, demos: { select: { sequence: true, voidedAt: true, rejected: true, postInstallAverage: true } } },
  });
  if (!circuit || circuit.voidedAt) return { error: "That circuit no longer exists." };
  if (circuit.state === "surveyed" || circuit.state === "ineligible") {
    return { error: "The circuit has to pass its eligibility checklist on the survey page first." };
  }
  const last = circuit.demos.reduce((m, d) => Math.max(m, d.sequence), 0);
  if (last >= MAX_DEMOS_PER_CIRCUIT) {
    logger.warn("demo.cap_refused", { actorId: a.admin.id, circuitId: circuit.id });
    return { error: `This circuit already has ${MAX_DEMOS_PER_CIRCUIT} demos on record — the maximum. Reject the one that should not count, or record an agreed benchmark instead.` };
  }
  const n = input.meteredLightCount ?? circuit.meteredLightCount;
  if (!Number.isInteger(n) || n < 1) return { error: "Say how many lights this demo meters." };
  const demo = await db.$transaction(async (tx) => {
    const d = await tx.circuitDemo.create({
      data: {
        circuitId: circuit.id,
        sequence: last + 1,
        meteredLightCount: n,
        combine: last === 0 ? "rerun" : input.combine,
        note: input.note?.trim() || null,
      },
    });
    await logChange(tx, { entity: "circuit_demo", entityId: d.id, kind: "edit", field: "started", circuitId: circuit.id, demoId: d.id, newValue: { sequence: d.sequence, combine: d.combine, meteredLightCount: n }, actorId: a.admin.id });
    await finish(tx, circuit.id, a.admin.id);
    return d;
  });
  logger.info("demo.started", { actorId: a.admin.id, circuitId: circuit.id, demoId: demo.id, sequence: demo.sequence, combine: demo.combine });
  revalidatePath(`/admin/societies/${circuit.societyId}/circuits/${circuit.id}`);
  return { ok: true, demoId: demo.id };
}

// ── Meter install & load test ───────────────────────────────────────────────

/**
 * The step picks the meter (optional — an old paper demo is re-entered without
 * one) and the install date, and validates the displayed load. With a meter,
 * the step writes the meter HISTORY entry; correcting the date here moves it.
 */
export async function recordDemoMeter(input: {
  demoId: string;
  meterId: string | null;
  installedOn: string;
  /** Watts shown on the meter; null only when no meter is used. */
  displayedLoad: number | null;
}): Promise<Outcome> {
  const a = await actor("field");
  if ("error" in a) return { error: a.error };
  const g = await editableDemo(input.demoId, a.admin.id, "meter");
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
    const theoretical = demo.circuit.meteredLightCount * demo.circuit.wattage;
    discrepancyPct = (Math.abs(input.displayedLoad - theoretical) / theoretical) * 100;
  } else if (input.displayedLoad !== null && Number.isFinite(input.displayedLoad) && input.displayedLoad > 0) {
    const theoretical = demo.circuit.meteredLightCount * demo.circuit.wattage;
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
      logger.warn("demo.meter_history_refused", { actorId: a.admin.id, demoId: demo.id, reason: "history_rewrite" });
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
          await logChange(tx, { entity: "meter_installation", entityId: own.id, kind: "history_edit", field: "replaced_by_demo_step", meterId: own.meterId, circuitId: own.circuitId, demoId: demo.id, oldValue: { installedAt: iso(own.installedAt), removedAt: iso(own.removedAt) }, actorId: a.admin.id });
          circuitIds.push(own.circuitId);
        }
      }
      if (plan && !("error" in plan)) {
        const res = await applySpanPlan(tx, plan, { actorId: a.admin.id, reason: `Demo ${demo.sequence} meter install` });
        circuitIds = circuitIds.concat(res.circuitIds);
        installationId = (await tx.meterInstallation.findFirst({ where: { meterId: input.meterId!, circuitId: demo.circuitId, installedAt: at }, select: { id: true } }))?.id ?? null;
      }
      await logChange(tx, {
        entity: "circuit_demo", entityId: demo.id, kind: "edit", field: "meter", circuitId: demo.circuitId, demoId: demo.id, actorId: a.admin.id,
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
      await finish(tx, demo.circuitId, a.admin.id);
      return circuitIds;
    },
    { timeout: 60_000, maxWait: 20_000 },
  );
  if (useMeter) await afterHistoryChange(affected.filter((c) => c !== demo.circuitId), a.admin.id);
  logger.info("demo.meter_recorded", { actorId: a.admin.id, demoId: demo.id, meterId: input.meterId, installedOn: input.installedOn, discrepancyPct });
  revalidatePath(pathOf(demo));
  revalidatePath("/admin/meters");
  if (discrepancyPct !== null && discrepancyPct > LOAD_TOLERANCE_PCT) {
    return { error: `Saved, but the displayed load is ${discrepancyPct.toFixed(1)}% from the circuit's lights — outside ±${LOAD_TOLERANCE_PCT}%. Recheck the light count, wattage and anything else on the circuit, or operations overrides it with a reason.` };
  }
  return { ok: true };
}

export async function overrideDemoLoad(demoId: string, reason: string): Promise<Outcome> {
  const a = await actor("ops");
  if ("error" in a) return { error: a.error };
  if (!reason.trim()) return { error: "A reason is required to override a failed load test." };
  const g = await editableDemo(demoId, a.admin.id, "load_override");
  if ("error" in g) return { error: g.error };
  if (g.demo.meterDisplayedLoad === null) return { error: "No load reading has been recorded yet." };
  await db.$transaction(async (tx) => {
    await tx.circuitDemo.update({ where: { id: demoId }, data: { loadValidationOverrideById: a.admin.id, loadValidationOverrideReason: reason.trim() } });
    await logChange(tx, { entity: "circuit_demo", entityId: demoId, kind: "edit", field: "load_override", circuitId: g.demo.circuitId, demoId, newValue: { reason: reason.trim() }, reason: reason.trim(), actorId: a.admin.id });
    await finish(tx, g.demo.circuitId, a.admin.id);
  });
  logger.info("demo.load_overridden", { actorId: a.admin.id, demoId, reason: reason.trim(), discrepancyPct: g.demo.loadDiscrepancyPct });
  revalidatePath(pathOf(g.demo));
  return { ok: true };
}

// ── Gate passes ─────────────────────────────────────────────────────────────

export async function submitDemoGatePass(input: {
  demoId: string;
  kind: "demo_install" | "demo_install_completion";
  items: string[];
  photoUrl?: string;
}): Promise<Outcome> {
  const a = await actor("field");
  if ("error" in a) return { error: a.error };
  const g = await editableDemo(input.demoId, a.admin.id, "gate_pass");
  if ("error" in g) return { error: g.error };
  const demo = g.demo;
  const items = input.items.map((i) => i.trim()).filter(Boolean);
  if (items.length === 0) return { error: "At least one equipment item is required." };
  if (input.kind === "demo_install" && !demo.meterInstalledAt) return { error: "The install gate pass opens once the meter is installed." };
  if (input.kind === "demo_install_completion" && !demo.lightReplacementDate) {
    return { error: "The completion gate pass lists the work done — record the light replacement first." };
  }
  const pass = await db.$transaction(async (tx) => {
    const p = await tx.gatePass.create({
      data: { circuitId: demo.circuitId, demoId: demo.id, kind: input.kind, itemsJson: items, photoUrl: input.photoUrl?.trim() || null, submittedById: a.admin.id },
    });
    await finish(tx, demo.circuitId, a.admin.id);
    return p;
  });
  await scheduleJob("gatepass_sweep", new Date());
  logger.info("gatepass.submitted", { gatePassId: pass.id, circuitId: demo.circuitId, demoId: demo.id, kind: input.kind, submittedBy: a.admin.id });
  revalidatePath(pathOf(demo));
  return { ok: true };
}

export async function decideDemoGatePass(gatePassId: string, decision: "approve" | "reject", reason?: string): Promise<Outcome> {
  const a = await actor("ops");
  if ("error" in a) return { error: a.error };
  if (decision === "reject" && !reason?.trim()) return { error: "A reason is required to reject a gate pass." };
  const pass = await db.gatePass.findUnique({ where: { id: gatePassId }, include: { circuit: { select: { societyId: true } } } });
  if (!pass) return { error: "Gate pass not found." };
  await db.gatePass.update({
    where: { id: gatePassId },
    data:
      decision === "approve"
        ? { status: "approved", approvedById: a.admin.id, approvedAt: new Date() }
        : { status: "rejected", rejectedReason: reason!.trim(), approvedById: a.admin.id, approvedAt: new Date() },
  });
  logger.info(decision === "approve" ? "gatepass.approved" : "gatepass.rejected", { gatePassId, by: a.admin.id, reason });
  revalidatePath(`/admin/societies/${pass.circuit.societyId}/circuits/${pass.circuitId}`);
  return { ok: true };
}

// ── Periods and readings ───────────────────────────────────────────────────

export async function setDemoPeriods(demoId: string, input: PeriodInput): Promise<Outcome> {
  const a = await actor("field");
  if ("error" in a) return { error: a.error };
  const g = await editableDemo(demoId, a.admin.id, "periods");
  if ("error" in g) return { error: g.error };
  const demo = g.demo;
  const refusal = refuseDemoPeriods(input, { meterInstalledAt: demo.meterInstalledAt, lightReplacementDate: demo.lightReplacementDate });
  if (refusal) {
    logger.warn("demo.periods_refused", { actorId: a.admin.id, demoId, reason: refusal });
    return { error: refusal };
  }
  const dates = periodDates(input);
  await db.$transaction(
    async (tx) => {
      await logChange(tx, {
        entity: "circuit_demo", entityId: demoId, kind: "edit", field: "periods", circuitId: demo.circuitId, demoId, actorId: a.admin.id,
        oldValue: { preFrom: iso(demo.preFrom), preTo: iso(demo.preTo), postFrom: iso(demo.postFrom), postTo: iso(demo.postTo) },
        newValue: input,
      });
      await tx.circuitDemo.update({ where: { id: demoId }, data: dates });
      await refreshDemoFromMeter(tx, demoId);
      await finish(tx, demo.circuitId, a.admin.id);
    },
    { timeout: 60_000, maxWait: 20_000 },
  );
  logger.info("demo.periods_set", { actorId: a.admin.id, demoId, ...input });
  revalidatePath(pathOf(demo));
  return { ok: true };
}

export async function refreshDemoReadings(demoId: string): Promise<Outcome & { created?: number; updated?: number; deleted?: number }> {
  const a = await actor("field");
  if ("error" in a) return { error: a.error };
  const g = await editableDemo(demoId, a.admin.id, "refresh");
  if ("error" in g) return { error: g.error };
  const res = await db.$transaction(
    async (tx) => {
      const r = await refreshDemoFromMeter(tx, demoId);
      await finish(tx, g.demo.circuitId, a.admin.id);
      return r;
    },
    { timeout: 60_000, maxWait: 20_000 },
  );
  logger.info("demo.readings_refreshed", { actorId: a.admin.id, demoId, ...res });
  revalidatePath(pathOf(g.demo));
  return { ok: true, ...res };
}

/** Type or correct one day. A meter day keeps its meter figure beside the typed one. */
export async function setDemoDay(input: { demoId: string; date: string; phase: "pre" | "post"; kWh: number }): Promise<Outcome> {
  const a = await actor("field");
  if ("error" in a) return { error: a.error };
  const g = await editableDemo(input.demoId, a.admin.id, "set_day");
  if ("error" in g) return { error: g.error };
  const demo = g.demo;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: "Pick the day." };
  if (!Number.isFinite(input.kWh) || input.kWh < 0) return { error: "The reading must be zero or a positive number of kWh." };
  const date = new Date(`${input.date}T00:00:00Z`);
  if (periodOfDay(date, demo) !== input.phase) {
    return { error: `That day is outside the ${input.phase === "pre" ? "pre" : "post"}-installation period — only the period's own days are this demo's readings.` };
  }
  const demoMode = await isDemoMode();
  const existing = await db.circuitDemoReading.findUnique({ where: { demoId_date_phase: { demoId: demo.id, date, phase: input.phase } } });
  await db.$transaction(async (tx) => {
    if (existing) {
      await tx.circuitDemoReading.update({
        where: { id: existing.id },
        data: {
          kWh: input.kWh,
          source: existing.source === "meter" ? "manual" : existing.source === "demo_generated" && !demoMode ? "manual" : existing.source,
          meterKwh: existing.source === "meter" ? existing.kWh : existing.meterKwh,
          editedById: a.admin.id,
        },
      });
    } else {
      await tx.circuitDemoReading.create({
        data: { demoId: demo.id, date, phase: input.phase, kWh: input.kWh, source: "manual", editedById: a.admin.id, hoursCovered: 24 },
      });
    }
    await logChange(tx, { entity: "circuit_demo_reading", entityId: existing?.id ?? `${demo.id}:${input.date}:${input.phase}`, kind: "edit", field: "kWh", circuitId: demo.circuitId, demoId: demo.id, oldValue: existing ? { kWh: existing.kWh, source: existing.source } : null, newValue: { kWh: input.kWh }, actorId: a.admin.id });
    await finish(tx, demo.circuitId, a.admin.id);
  });
  logger.info("demo.day_set", { actorId: a.admin.id, demoId: demo.id, date: input.date, phase: input.phase, kWh: input.kWh, replaced: existing?.kWh ?? null });
  revalidatePath(pathOf(demo));
  return { ok: true };
}

/** Put a typed day back to what the meter recorded. */
export async function revertDemoDayToMeter(readingId: string): Promise<Outcome> {
  const a = await actor("field");
  if ("error" in a) return { error: a.error };
  const r = await db.circuitDemoReading.findUnique({ where: { id: readingId }, select: { id: true, demoId: true, kWh: true, meterKwh: true } });
  if (!r) return { error: "That reading is no longer on record." };
  if (r.meterKwh === null) return { error: "There is no meter figure for that day to go back to." };
  const g = await editableDemo(r.demoId, a.admin.id, "revert_day");
  if ("error" in g) return { error: g.error };
  await db.$transaction(async (tx) => {
    await tx.circuitDemoReading.update({ where: { id: r.id }, data: { kWh: r.meterKwh!, source: "meter", meterKwh: null, editedById: a.admin.id } });
    await logChange(tx, { entity: "circuit_demo_reading", entityId: r.id, kind: "edit", field: "revert_to_meter", circuitId: g.demo.circuitId, demoId: r.demoId, oldValue: { kWh: r.kWh }, newValue: { kWh: r.meterKwh }, actorId: a.admin.id });
    await finish(tx, g.demo.circuitId, a.admin.id);
  });
  revalidatePath(pathOf(g.demo));
  return { ok: true };
}

export async function setDemoDayExclusion(readingId: string, exclude: boolean, reason?: string): Promise<Outcome> {
  const a = await actor("field");
  if ("error" in a) return { error: a.error };
  if (exclude && !reason?.trim()) return { error: "Say why the day is excluded — it stays listed with its reason." };
  const r = await db.circuitDemoReading.findUnique({ where: { id: readingId }, select: { id: true, demoId: true, excludedAt: true, excludedReason: true } });
  if (!r) return { error: "That reading is no longer on record." };
  const g = await editableDemo(r.demoId, a.admin.id, "exclude_day");
  if ("error" in g) return { error: g.error };
  await db.$transaction(async (tx) => {
    await tx.circuitDemoReading.update({
      where: { id: r.id },
      data: exclude ? { excludedAt: new Date(), excludedById: a.admin.id, excludedReason: reason!.trim() } : { excludedAt: null, excludedById: null, excludedReason: null },
    });
    await logChange(tx, { entity: "circuit_demo_reading", entityId: r.id, kind: "edit", field: "excluded", circuitId: g.demo.circuitId, demoId: r.demoId, oldValue: { excluded: r.excludedAt !== null, reason: r.excludedReason }, newValue: { excluded: exclude, reason: reason?.trim() ?? null }, reason: reason?.trim() ?? null, actorId: a.admin.id });
    await finish(tx, g.demo.circuitId, a.admin.id);
  });
  logger.info("demo.day_exclusion", { actorId: a.admin.id, readingId, exclude, reason });
  revalidatePath(pathOf(g.demo));
  return { ok: true };
}

/** "Accept these N days" — a new version; the figures follow. */
export async function acceptDemoPhase(demoId: string, phase: "pre" | "post"): Promise<Outcome> {
  const a = await actor("field");
  if ("error" in a) return { error: a.error };
  const g = await editableDemo(demoId, a.admin.id, "accept");
  if ("error" in g) return { error: g.error };
  const demo = g.demo;
  if (phase === "post" && !demo.lightReplacementDate) return { error: "Record the light replacement before accepting post-installation readings." };
  const rows = (await db.circuitDemoReading.findMany({ where: { demoId, phase } })).filter((r) => periodOfDay(r.date, demo) === phase);
  const refusal = refuseAcceptance(rows);
  if (refusal) return { error: refusal };
  const snap = acceptanceOf(rows);
  let confirmedInBand = false;
  await db.$transaction(async (tx) => {
    const last = await tx.circuitDemoAcceptance.findFirst({ where: { demoId, phase }, orderBy: { version: "desc" }, select: { version: true } });
    await tx.circuitDemoAcceptance.create({
      data: { demoId, phase, version: (last?.version ?? 0) + 1, days: snap.days, averageKwh: snap.averageKwh, countedDays: snap.countedDays, acceptedById: a.admin.id },
    });
    await finish(tx, demo.circuitId, a.admin.id);
    const after = await tx.circuit.findUnique({ where: { id: demo.circuitId }, select: { state: true } });
    confirmedInBand = phase === "post" && after?.state === "benchmark_confirmed";
  });
  logger.info("demo.phase_accepted", { actorId: a.admin.id, demoId, phase, days: snap.countedDays, averageKwh: snap.averageKwh });
  // The demo report generates itself once every circuit of the deal is confirmed.
  if (confirmedInBand && demo.circuit.siteSurvey?.pipelineId) {
    await generateDemoReportInternal(demo.circuit.siteSurvey.pipelineId, null).catch((err) =>
      logger.warn("demo.report_autogen_failed", { demoId, error: String(err) }),
    );
  }
  revalidatePath(pathOf(demo));
  revalidatePath("/portal");
  return { ok: true };
}

// ── The replacement ─────────────────────────────────────────────────────────

export async function assignDemoReplacement(input: { demoId: string; toId: string | null }): Promise<Outcome> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };
  const g = await editableDemo(input.demoId, admin.id, "assign_replacement");
  if ("error" in g) return { error: g.error };
  const demo = g.demo;
  const ops = isOps(admin.permissions as string[]);
  if (!ops && demo.circuit.siteSurvey?.pipeline?.surveyOwnerId !== admin.id) {
    logger.warn("demo.replacement_assign_refused", { demoId: demo.id, actorId: admin.id });
    return { error: "Only operations, or whoever is holding this deal's field work, can hand on the replacement." };
  }
  if (input.toId) {
    const to = await db.adminUser.findFirst({ where: { id: input.toId, isActive: true, deletedAt: null }, select: { id: true, team: true, name: true, email: true, permissions: true } });
    if (!to) return { error: "That account cannot take the replacement." };
    if (!canOwn(to.team, "survey")) return { error: `${to.name ?? to.email} is on the ${teamMeta(to.team).label} team — the replacement goes to engineering or inspection.` };
    if (!to.permissions.includes("manage_survey")) return { error: `${to.name ?? to.email} does not hold Manage survey, so they could not record the work.` };
  }
  await db.$transaction(async (tx) => {
    await tx.circuitDemo.update({
      where: { id: demo.id },
      data: { replacementOwnerId: input.toId, replacementAssignedAt: input.toId ? new Date() : null, replacementAssignedById: input.toId ? admin.id : null },
    });
    if (input.toId) {
      await tx.scheduledEvent.updateMany({ where: { demoId: demo.id, kind: "installation_day", status: "scheduled" }, data: { assigneeId: input.toId } });
    } else {
      await tx.scheduledEvent.updateMany({
        where: { demoId: demo.id, kind: "installation_day", status: "scheduled" },
        data: { status: "cancelled", cancelledAt: new Date(), cancelledReason: "The replacement was unassigned — nobody is coming." },
      });
    }
    await logChange(tx, { entity: "circuit_demo", entityId: demo.id, kind: "edit", field: "replacementOwner", circuitId: demo.circuitId, demoId: demo.id, oldValue: demo.replacementOwnerId, newValue: input.toId, actorId: admin.id });
    await finish(tx, demo.circuitId, admin.id);
  });
  logger.info("demo.replacement_assigned", { demoId: demo.id, toId: input.toId, byId: admin.id });
  revalidatePath(pathOf(demo));
  revalidatePath("/admin/schedule");
  return { ok: true };
}

export async function updateDemoReplacementVisit(
  demoId: string,
  input: { scheduledAt?: string; contactName?: string; contactPhone?: string; note?: string },
): Promise<Outcome> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };
  const g = await editableDemo(demoId, admin.id, "replacement_visit");
  if ("error" in g) return { error: g.error };
  const demo = g.demo;
  if (!demo.replacementOwnerId) return { error: "Assign the replacement to someone first — the visit is theirs to arrange." };
  if (demo.replacementOwnerId !== admin.id && !isOps(admin.permissions as string[])) {
    logger.warn("demo.replacement_visit_refused", { demoId, actorId: admin.id });
    return { error: "Only the assignee or operations can arrange this visit." };
  }
  let scheduledAt: Date | null = null;
  if (input.scheduledAt) {
    scheduledAt = new Date(`${input.scheduledAt}:00.000Z`);
    if (Number.isNaN(scheduledAt.getTime())) return { error: "That is not a valid date and time." };
  }
  const contactName = input.contactName?.trim() || null;
  const contactPhone = input.contactPhone?.trim() || null;
  if (contactPhone && !contactName) return { error: "Say who the number belongs to — a phone number with no name helps nobody at the gate." };
  const existing = await db.scheduledEvent.findFirst({ where: { demoId, kind: "installation_day", status: "scheduled" }, orderBy: { startAt: "asc" } });
  await db.$transaction(async (tx) => {
    if (!scheduledAt) {
      if (existing) {
        await tx.scheduledEvent.update({ where: { id: existing.id }, data: { status: "cancelled", cancelledAt: new Date(), cancelledReason: "The slot was cleared — no visit is booked." } });
      }
    } else if (existing) {
      await tx.scheduledEvent.update({
        where: { id: existing.id },
        data: { startAt: scheduledAt, assigneeId: demo.replacementOwnerId!, contactName, contactPhone, note: input.note?.trim() || null },
      });
    } else {
      await tx.scheduledEvent.create({
        data: {
          kind: "installation_day",
          title: eventTitle("installation_day", demo.circuit.society.name),
          startAt: scheduledAt,
          assigneeId: demo.replacementOwnerId!,
          createdById: admin.id,
          societyId: demo.circuit.societyId,
          circuitId: demo.circuitId,
          demoId,
          contactName,
          contactPhone,
          note: input.note?.trim() || null,
        },
      });
    }
    await logChange(tx, { entity: "circuit_demo", entityId: demoId, kind: "edit", field: "replacementVisit", circuitId: demo.circuitId, demoId, oldValue: existing ? existing.startAt.toISOString() : null, newValue: input.scheduledAt ?? null, actorId: admin.id });
    await finish(tx, demo.circuitId, admin.id);
  });
  logger.info("demo.replacement_visit_updated", { demoId, actorId: admin.id, scheduledAt: input.scheduledAt });
  revalidatePath(pathOf(demo));
  revalidatePath("/admin/schedule");
  return { ok: true };
}

export type DemoReplacementLine = { lineId: string; replacementTypeId: string; count: number; wattage: number };

/**
 * Record the replacement (the pivot day) — or correct it. The work has to be
 * handed to a crew and booked first; the day must fall after the pre period
 * and before the post period.
 */
export async function recordDemoReplacement(input: { demoId: string; replacedOn: string; lines?: DemoReplacementLine[] }): Promise<Outcome> {
  const a = await actor("field");
  if ("error" in a) return { error: a.error };
  const g = await editableDemo(input.demoId, a.admin.id, "replacement");
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
  if (!correcting && devices.length > 0) {
    for (const line of devices) {
      const r = byLine.get(line.id);
      if (!r) return { error: `Record what replaced the ${line.count} × ${line.deviceType.name} — every line needs its installed device.` };
      if (!line.deviceType.replacementOptions.some((o) => o.replacementTypeId === r.replacementTypeId)) {
        return { error: `That device isn't in the compatibility list for ${line.deviceType.name}.` };
      }
      if (!Number.isInteger(r.count) || r.count < 1 || r.count > 5000) return { error: `Installed count for ${line.deviceType.name} must be a whole number.` };
      if (!Number.isFinite(r.wattage) || r.wattage <= 0 || r.wattage > 2000) return { error: `Installed wattage for ${line.deviceType.name} must be between 1 and 2000 W.` };
    }
  }
  await db.$transaction(async (tx) => {
    if (!correcting) {
      for (const line of devices) {
        const r = byLine.get(line.id)!;
        await tx.circuitDevice.update({
          where: { id: line.id },
          data: { replacementTypeId: r.replacementTypeId, replacementCount: r.count, replacementWattage: r.wattage, replacedAt: date, replacedById: a.admin.id },
        });
      }
    } else {
      await tx.circuitDevice.updateMany({ where: { circuitId: demo.circuitId, replacedAt: demo.lightReplacementDate }, data: { replacedAt: date } });
    }
    await tx.circuitDemo.update({ where: { id: demo.id }, data: { lightReplacementDate: date } });
    await logChange(tx, { entity: "circuit_demo", entityId: demo.id, kind: "edit", field: "lightReplacementDate", circuitId: demo.circuitId, demoId: demo.id, oldValue: iso(demo.lightReplacementDate), newValue: input.replacedOn, actorId: a.admin.id });
    await finish(tx, demo.circuitId, a.admin.id);
  });
  logger.info(correcting ? "demo.replacement_corrected" : "demo.replacement_recorded", { actorId: a.admin.id, demoId: demo.id, replacedOn: input.replacedOn });
  revalidatePath(pathOf(demo));
  return { ok: true };
}

// ── Lock, unlock, reject ────────────────────────────────────────────────────

export async function unlockDemo(demoId: string, reason: string): Promise<Outcome> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };
  const demo = await db.circuitDemo.findUnique({ where: { id: demoId }, select: demoSelect });
  if (!demo) return { error: "That demo is no longer on record." };
  const shared = await sharedInReport(demo.id, demo.circuit.siteSurvey?.pipelineId);
  const refusal = refuseUnlock({ isOps: isOps(admin.permissions as string[]), reason, sharedInReport: shared });
  if (refusal) {
    logger.warn("demo.unlock_refused", { actorId: admin.id, demoId, refusal });
    return { error: refusal };
  }
  const until = unlockUntil(new Date());
  await db.$transaction(async (tx) => {
    await tx.circuitDemo.update({ where: { id: demoId }, data: { unlockedUntil: until, unlockedById: admin.id, unlockReason: reason.trim() } });
    await logChange(tx, { entity: "circuit_demo", entityId: demoId, kind: "unlock", circuitId: demo.circuitId, demoId, newValue: { until: until.toISOString() }, reason: reason.trim(), actorId: admin.id });
  });
  await scheduleJob("demo_relock_sweep", until);
  logger.info("demo.unlocked", { actorId: admin.id, demoId, until: until.toISOString(), reason: reason.trim() });
  revalidatePath(pathOf(demo));
  return { ok: true };
}

export async function relockDemo(demoId: string): Promise<Outcome> {
  const a = await actor("ops");
  if ("error" in a) return { error: a.error };
  const demo = await db.circuitDemo.findUnique({ where: { id: demoId }, select: demoSelect });
  if (!demo) return { error: "That demo is no longer on record." };
  await db.$transaction(async (tx) => {
    await tx.circuitDemo.update({ where: { id: demoId }, data: { unlockedUntil: null } });
    await logChange(tx, { entity: "circuit_demo", entityId: demoId, kind: "relock", circuitId: demo.circuitId, demoId, actorId: a.admin.id });
  });
  logger.info("demo.relocked", { actorId: a.admin.id, demoId });
  revalidatePath(pathOf(demo));
  return { ok: true };
}

export async function setDemoRejected(input: { demoId: string; rejected: boolean; reason?: string }): Promise<Outcome> {
  const a = await actor("ops");
  if ("error" in a) return { error: "Deciding which demos count is an operations lead action." };
  if (input.rejected && !input.reason?.trim()) return { error: "Say why this demo is being rejected — a rejection with no stated reason cannot be reviewed later." };
  const demo = await db.circuitDemo.findUnique({ where: { id: input.demoId }, select: demoSelect });
  if (!demo) return { error: "That demo is no longer on record." };
  await db.$transaction(async (tx) => {
    await tx.circuitDemo.update({
      where: { id: input.demoId },
      data: { rejected: input.rejected, rejectionReason: input.rejected ? input.reason!.trim() : null, decidedById: a.admin.id, decidedAt: new Date() },
    });
    await logChange(tx, { entity: "circuit_demo", entityId: input.demoId, kind: "edit", field: "rejected", circuitId: demo.circuitId, demoId: input.demoId, oldValue: demo.rejected, newValue: input.rejected, reason: input.reason?.trim() ?? null, actorId: a.admin.id });
    await finish(tx, demo.circuitId, a.admin.id);
  });
  logger.info("demo.decided", { actorId: a.admin.id, demoId: input.demoId, rejected: input.rejected });
  revalidatePath(pathOf(demo));
  return { ok: true };
}

export async function setBenchmarkOverride(input: { circuitId: string; pct: number | null; reason?: string }): Promise<Outcome> {
  const a = await actor("ops");
  if ("error" in a) return { error: "Overriding a benchmark is an operations lead action." };
  if (input.pct !== null) {
    if (!Number.isFinite(input.pct) || input.pct <= 0 || input.pct >= 100) return { error: "A savings benchmark is a percentage between 0 and 100." };
    if (!input.reason?.trim()) return { error: "Say why — an overridden benchmark with no stated reason is indistinguishable from a typo." };
  }
  const circuit = await db.circuit.findUnique({ where: { id: input.circuitId }, select: { id: true, societyId: true, benchmarkOverridePct: true } });
  if (!circuit) return { error: "That circuit no longer exists." };
  await db.$transaction(async (tx) => {
    await tx.circuit.update({
      where: { id: input.circuitId },
      data:
        input.pct === null
          ? { benchmarkOverridePct: null, benchmarkOverrideReason: null, benchmarkOverrideById: null, benchmarkOverrideAt: null }
          : { benchmarkOverridePct: input.pct, benchmarkOverrideReason: input.reason!.trim(), benchmarkOverrideById: a.admin.id, benchmarkOverrideAt: new Date() },
    });
    await logChange(tx, { entity: "circuit", entityId: input.circuitId, kind: "edit", field: "benchmarkOverride", circuitId: input.circuitId, oldValue: circuit.benchmarkOverridePct, newValue: input.pct, reason: input.reason?.trim() ?? null, actorId: a.admin.id });
    await finish(tx, input.circuitId, a.admin.id);
  });
  logger.info("circuit.benchmark_override", { actorId: a.admin.id, circuitId: input.circuitId, pct: input.pct });
  revalidatePath(`/admin/societies/${circuit.societyId}/circuits/${circuit.id}`);
  return { ok: true };
}

/**
 * The pre-installation report's "assign for investigation": a demo's
 * before-average far from the circuit's theoretical load is filed as a
 * non-blocking anomaly for somebody to look at on site.
 */
export async function raisePreInstallInvestigation(
  circuitId: string,
  note: string,
  variancePct: number,
): Promise<{ error: string } | { ok: true }> {
  const admin = await resolveAdmin();
  if (!admin || !(admin.permissions as string[]).includes("manage_survey")) {
    return { error: "Raising an investigation is a field-survey action." };
  }
  if (!note.trim()) return { error: "Say what the inspector should look for." };
  const circuit = await db.circuit.findUnique({
    where: { id: circuitId },
    select: { id: true, societyId: true, voidedAt: true },
  });
  if (!circuit || circuit.voidedAt) return { error: "That circuit no longer exists." };
  await db.readingAnomaly.create({
    data: {
      circuitId: circuit.id,
      period: new Date().toISOString().slice(0, 7),
      kind: "out_of_range",
      detail: `Pre-installation average varies ${variancePct > 0 ? "+" : ""}${variancePct.toFixed(1)}% from the circuit's theoretical load — assigned for on-site investigation: ${note.trim()}`,
      deviationPct: variancePct,
      blocksBilling: false,
    },
  });
  logger.info("circuit.investigation_raised", { actorId: admin.id, circuitId: circuit.id, variancePct });
  revalidatePath(`/admin/societies/${circuit.societyId}/circuits/${circuit.id}`);
  return { ok: true };
}
