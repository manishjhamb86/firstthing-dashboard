import type { MeterAlertKind, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { EXCLUSION_DEVICE_SELECT, exclusionFromDevices, expectedDailyKwh } from "@/lib/circuit-load";
import { circuitLabelOf } from "@/lib/meter-view";
import { sharedInReport } from "@/lib/demo-step-core";
import { currentDemoOf, demoFacts, demoFactsInclude } from "@/lib/circuit-figures";
import { demoMonitoringPeriod, judgePostInstallDay, judgePreInstallDay, readingDueDate } from "@/lib/demo-monitoring";
import { notifyDemoAlert } from "@/lib/push-notify";
import type { DemoAlertKind } from "@/lib/push-messages";

/**
 * Writes the three `MeterAlert` kinds `demo-monitoring.ts` decides, and the
 * task a missing reading raises (2026-10-06, user-asked). Reuses the exact
 * open/close/one-row-per-condition shape every other alert in this codebase
 * already follows (`meter-alerts.ts`, `savings-band-alerts.ts`) — the
 * partial unique index on `(circuit_id, kind)` already covers these three
 * kinds generically, so no new index or table was needed.
 *
 * Deliberately a circuit-scoped function, safe to call as often as you like
 * — called once per candidate circuit by the daily sweep
 * (scripts/job-worker.ts's `demo_monitoring_sweep`).
 */

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

async function syncAlert(
  circuitId: string,
  kind: MeterAlertKind,
  verdict: { anomalous: boolean; message: string } | null,
  detail?: Prisma.InputJsonValue,
  /** Why it closed, when `verdict` is null (not anomalous has its own fixed reason). */
  notApplicableReason = "The monitoring window has ended.",
): Promise<{ opened: boolean; closed: boolean }> {
  const open = await db.meterAlert.findFirst({ where: { circuitId, kind, closedAt: null }, select: { id: true } });

  if (!verdict || !verdict.anomalous) {
    if (open) {
      await db.meterAlert.updateMany({
        where: { id: open.id, closedAt: null },
        data: { closedAt: new Date(), closedReason: verdict ? "Back within range." : notApplicableReason },
      });
      return { opened: false, closed: true };
    }
    return { opened: false, closed: false };
  }

  if (open) {
    await db.meterAlert.update({ where: { id: open.id }, data: { message: verdict.message, detail } });
    return { opened: false, closed: false };
  }

  try {
    await db.meterAlert.create({ data: { circuitId, kind, message: verdict.message, detail } });
    return { opened: true, closed: false };
  } catch (err) {
    if (isUniqueViolation(err)) return { opened: false, closed: false };
    throw err;
  }
}

/**
 * Who is chased for a demo's current period: the field person who did the
 * work, and whoever assigned them. Pre-install has no dedicated "meter
 * installer" field on `CircuitDemo` — only `MeterInstallation.installedById`
 * (null for a demo that skipped a meter) — so it falls back to the survey's
 * own field owner, matching that field's own doc comment ("the field person
 * the survey AND demo commissioning are handed to").
 */
async function responsibleParties(
  period: "pre" | "post",
  demo: { meterInstallationId: string | null; replacementOwnerId: string | null; replacementAssignedById: string | null },
  surveyOwnerId: string | null,
  surveyAssignedById: string | null,
): Promise<{ doerId: string | null; assignerId: string | null }> {
  if (period === "post") return { doerId: demo.replacementOwnerId, assignerId: demo.replacementAssignedById };
  let doerId = surveyOwnerId;
  if (demo.meterInstallationId) {
    const inst = await db.meterInstallation.findUnique({ where: { id: demo.meterInstallationId }, select: { installedById: true } });
    if (inst?.installedById) doerId = inst.installedById;
  }
  return { doerId, assignerId: surveyAssignedById };
}

/** The title every system-raised "upload the reading" task shares, so one find-before-create works. */
const READINGS_TASK_TITLE_PREFIX = "Upload yesterday's demo reading";

async function ensureReadingsTask(input: {
  circuitId: string;
  societyId: string;
  demoId: string;
  label: string;
  doerId: string;
  assignerId: string | null;
}): Promise<void> {
  const existing = await db.scheduledEvent.findFirst({
    where: { circuitId: input.circuitId, kind: "task", status: "scheduled", title: { startsWith: READINGS_TASK_TITLE_PREFIX } },
    select: { id: true, assigneeId: true },
  });
  if (existing) {
    // The doer can change mid-window (a reassignment) — keep the task pointed
    // at whoever is actually responsible right now rather than leaving it on
    // a person who no longer is.
    if (existing.assigneeId !== input.doerId) {
      await db.scheduledEvent.update({ where: { id: existing.id }, data: { assigneeId: input.doerId } });
    }
    return;
  }
  await db.scheduledEvent.create({
    data: {
      kind: "task",
      title: `${READINGS_TASK_TITLE_PREFIX} — ${input.label}`,
      description: "A day's reading inside the demo's chosen period has not landed yet. Upload it so the window can keep moving.",
      priority: "high",
      startAt: new Date(),
      allDay: true,
      assigneeId: input.doerId,
      createdById: input.assignerId ?? input.doerId,
      societyId: input.societyId,
      circuitId: input.circuitId,
      demoId: input.demoId,
    },
  });
  logger.info("demo_monitoring.readings_task_created", { circuitId: input.circuitId, demoId: input.demoId });
}

async function closeReadingsTask(circuitId: string): Promise<void> {
  const { count } = await db.scheduledEvent.updateMany({
    where: { circuitId, kind: "task", status: "scheduled", title: { startsWith: READINGS_TASK_TITLE_PREFIX } },
    data: { status: "done", completedAt: new Date(), completionNote: "A reading landed — closed automatically." },
  });
  if (count > 0) logger.info("demo_monitoring.readings_task_closed", { circuitId, count });
}

export async function syncDemoMonitoringAlerts(circuitId: string, now = new Date()): Promise<void> {
  const circuit = await db.circuit.findUnique({
    where: { id: circuitId },
    select: {
      id: true,
      societyId: true,
      location: true,
      lightType: true,
      voidedAt: true,
      state: true,
      wattage: true,
      workingHours: true,
      society: { select: { name: true } },
      devices: { select: EXCLUSION_DEVICE_SELECT },
      siteSurvey: {
        select: { pipelineId: true, pipeline: { select: { surveyOwnerId: true, surveyAssignedById: true } } },
      },
      demos: {
        select: {
          id: true,
          sequence: true,
          voidedAt: true,
          rejected: true,
          meterInstallationId: true,
          meteredLightCount: true,
          preFrom: true,
          preTo: true,
          postFrom: true,
          postTo: true,
          replacementOwnerId: true,
          replacementAssignedById: true,
          ...demoFactsInclude,
          meterInstalledAt: true,
          meterSkipped: true,
          meterDisplayedLoad: true,
          loadDiscrepancyPct: true,
          loadValidationOverrideById: true,
          lightReplacementDate: true,
        },
      },
    },
  });
  if (!circuit || circuit.voidedAt) return;

  const demo = currentDemoOf(circuit.demos);
  if (!demo) {
    // Nothing live at all — nothing to watch, and nothing lingering to close.
    await Promise.all([
      syncAlert(circuitId, "demo_pre_variance", null),
      syncAlert(circuitId, "demo_post_variance", null),
      syncAlert(circuitId, "demo_readings_missing", null),
    ]);
    await closeReadingsTask(circuitId);
    return;
  }

  const eligible = circuit.state !== "surveyed" && circuit.state !== "ineligible";
  const ex = exclusionFromDevices(circuit.devices);
  const facts = demoFacts(demo, eligible, ex);
  const shared = await sharedInReport(demo.id, circuit.siteSurvey?.pipelineId);
  const period = demoMonitoringPeriod(demo, facts.postAccepted, shared);

  if (period === "none") {
    await Promise.all([
      syncAlert(circuitId, "demo_pre_variance", null),
      syncAlert(circuitId, "demo_post_variance", null),
      syncAlert(circuitId, "demo_readings_missing", null),
    ]);
    await closeReadingsTask(circuitId);
    return;
  }

  // The non-current period's alert is always closed outright — a demo that
  // has moved from pre to post must not leave a stale pre-variance alert open.
  const otherKind: DemoAlertKind = period === "pre" ? "demo_post_variance" : "demo_pre_variance";
  await syncAlert(circuitId, otherKind, null);

  const label = circuitLabelOf(circuit.location, circuit.lightType);
  const society = circuit.society.name;
  const { doerId, assignerId } = await responsibleParties(
    period,
    demo,
    circuit.siteSurvey?.pipeline?.surveyOwnerId ?? null,
    circuit.siteSurvey?.pipeline?.surveyAssignedById ?? null,
  );

  const dueDate = readingDueDate(period, demo, now);
  const dueKey = dueDate ? dueDate.toISOString().slice(0, 10) : null;
  const reading = dueKey
    ? demo.readings.find((r) => r.phase === period && r.date.toISOString().slice(0, 10) === dueKey)
    : undefined;

  if (dueDate && !reading) {
    const result = await syncAlert(circuitId, "demo_readings_missing", {
      anomalous: true,
      message: `${society} · ${label}: no ${period}-install reading was recorded for ${dueKey}.`,
    });
    if (result.opened && doerId) {
      await ensureReadingsTask({ circuitId, societyId: circuit.societyId, demoId: demo.id, label: `${society} · ${label}`, doerId, assignerId });
      await notifyDemoAlert({
        kind: "demo_readings_missing",
        circuitId,
        what: `${society} · ${label}`,
        detail: `No ${period}-install reading for ${dueKey}.`,
        url: `/admin/societies/${circuit.societyId}/circuits/${circuitId}`,
        ref: circuitId,
        toIds: [doerId, assignerId],
      });
    }
    // A reading genuinely missing today is not something to also judge for
    // variance — there is nothing to judge.
    await syncAlert(circuitId, period === "pre" ? "demo_pre_variance" : "demo_post_variance", null);
    return;
  }

  // A reading landed (or nothing is due today) — the missing-readings alert
  // and its task, if any, clear.
  const missingClosed = await syncAlert(circuitId, "demo_readings_missing", null, undefined, "A reading landed.");
  if (missingClosed.closed) await closeReadingsTask(circuitId);

  if (!reading || reading.excludedAt !== null) return; // nothing fresh and usable to judge

  const verdictKind: DemoAlertKind = period === "pre" ? "demo_pre_variance" : "demo_post_variance";
  const verdict =
    period === "pre"
      ? judgePreInstallDay(reading.kWh, expectedDailyKwh({ meteredLightCount: demo.meteredLightCount, wattage: circuit.wattage, workingHours: circuit.workingHours ?? 24, devices: circuit.devices }))
      : judgePostInstallDay(reading.kWh, facts.preAverage ?? 0, ex);

  const result = await syncAlert(circuitId, verdictKind, { anomalous: verdict.anomalous, message: `${society} · ${label}: ${verdict.message}` }, {
    pct: verdict.pct,
    date: dueKey,
  });
  if (result.opened) {
    await notifyDemoAlert({
      kind: verdictKind,
      circuitId,
      what: `${society} · ${label}`,
      detail: verdict.message,
      url: `/admin/societies/${circuit.societyId}/circuits/${circuitId}`,
      ref: circuitId,
      toIds: [doerId, assignerId],
    });
  }
}
