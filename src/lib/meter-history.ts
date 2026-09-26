/**
 * The meter history is the one record of where a meter was (2026-09-26).
 *
 * Every write to `MeterInstallation` goes through here, so three things always
 * happen together: the row changes, the old values are logged, and the
 * device's `circuitId`/`societyId` — now only a cache of the open entry — is
 * brought back in line. After the transaction, `afterHistoryChange` re-projects
 * every circuit that gained or lost days and refreshes their unlocked demos.
 */
import { db } from "@/lib/db";
import type { Tx } from "@/lib/tx";
import { logger } from "@/lib/logger";
import { logChange } from "@/lib/change-log";
import { projectCircuitMonitoring } from "@/lib/monitoring-projection";
import { refreshDemoFromMeter } from "@/lib/demo-refresh";
import { resyncCircuitFigures } from "@/lib/circuit-figures";
import { syncCircuitBandAlert } from "@/lib/savings-band-alerts";
import { rederiveInvoiceMonthsForCircuit } from "@/lib/invoice-rederive";
import { demoLockState } from "@/lib/demo-lock";
import { isDemoMode } from "@/lib/demo-mode";
import { dayMs } from "@/lib/demo-periods";
import type { SpanPlan } from "@/lib/meter-installation";

const stayValue = (s: { circuitId: string; installedAt: Date; removedAt: Date | null }) => ({
  circuitId: s.circuitId,
  installedAt: s.installedAt.toISOString().slice(0, 10),
  removedAt: s.removedAt ? s.removedAt.toISOString().slice(0, 10) : null,
});

/** Bring each device's cached binding in line with its open entry. */
export async function syncMeterCache(tx: Tx, meterIds: readonly string[], actorId: string | null): Promise<void> {
  const ids = [...new Set(meterIds)];
  // Clear first: `MeterDevice.circuitId` is unique, and a swap between two
  // meters would otherwise collide half-way.
  await tx.meterDevice.updateMany({ where: { id: { in: ids } }, data: { circuitId: null } });
  for (const id of ids) {
    const open = await tx.meterInstallation.findFirst({
      where: { meterId: id, removedAt: null },
      select: { circuitId: true, societyId: true, installedAt: true },
    });
    await tx.meterDevice.update({
      where: { id },
      data: open
        ? { circuitId: open.circuitId, societyId: open.societyId, assignedAt: open.installedAt, assignedById: actorId }
        : { circuitId: null, societyId: null, assignedAt: null, assignedById: null },
    });
  }
}

/** Apply a span plan (trims, splits, deletes, the new entry) in a transaction. */
export async function applySpanPlan(
  tx: Tx,
  plan: SpanPlan,
  ctx: { actorId: string; reason: string | null },
): Promise<{ circuitIds: string[]; meterIds: string[] }> {
  const circuitIds = new Set<string>([plan.create.circuitId]);
  const meterIds = new Set<string>([plan.create.meterId]);
  for (const c of plan.changes) {
    const s = c.stay;
    circuitIds.add(s.circuitId);
    meterIds.add(s.meterId);
    const old = stayValue(s);
    if (c.kind === "delete") {
      await tx.meterInstallation.delete({ where: { id: s.id } });
      await logChange(tx, { entity: "meter_installation", entityId: s.id, kind: "history_edit", field: "deleted", meterId: s.meterId, circuitId: s.circuitId, oldValue: old, newValue: null, reason: ctx.reason, actorId: ctx.actorId });
    } else if (c.kind === "trim-end") {
      await tx.meterInstallation.update({ where: { id: s.id }, data: { removedAt: c.removedAt, removedById: ctx.actorId, removalNote: ctx.reason } });
      await logChange(tx, { entity: "meter_installation", entityId: s.id, kind: "history_edit", field: "removedAt", meterId: s.meterId, circuitId: s.circuitId, oldValue: old, newValue: stayValue({ ...s, removedAt: c.removedAt }), reason: ctx.reason, actorId: ctx.actorId });
    } else if (c.kind === "trim-start") {
      await tx.meterInstallation.update({ where: { id: s.id }, data: { installedAt: c.installedAt, startInferred: false } });
      await logChange(tx, { entity: "meter_installation", entityId: s.id, kind: "history_edit", field: "installedAt", meterId: s.meterId, circuitId: s.circuitId, oldValue: old, newValue: stayValue({ ...s, installedAt: c.installedAt }), reason: ctx.reason, actorId: ctx.actorId });
    } else {
      await tx.meterInstallation.update({ where: { id: s.id }, data: { removedAt: c.removedAt, removedById: ctx.actorId, removalNote: ctx.reason } });
      const tail = await tx.meterInstallation.create({
        data: { meterId: s.meterId, circuitId: s.circuitId, societyId: s.societyId, installedAt: c.tailFrom, removedAt: s.removedAt, installedById: ctx.actorId },
      });
      await logChange(tx, { entity: "meter_installation", entityId: s.id, kind: "history_edit", field: "split", meterId: s.meterId, circuitId: s.circuitId, oldValue: old, newValue: { head: stayValue({ ...s, removedAt: c.removedAt }), tail: stayValue(tail) }, reason: ctx.reason, actorId: ctx.actorId });
    }
  }
  const target = await tx.circuit.findUniqueOrThrow({ where: { id: plan.create.circuitId }, select: { societyId: true } });
  const created = await tx.meterInstallation.create({
    data: {
      meterId: plan.create.meterId,
      circuitId: plan.create.circuitId,
      societyId: target.societyId,
      installedAt: plan.create.installedAt,
      removedAt: plan.create.removedAt,
      installedById: ctx.actorId,
    },
  });
  await logChange(tx, { entity: "meter_installation", entityId: created.id, kind: "history_edit", field: "created", meterId: created.meterId, circuitId: created.circuitId, oldValue: null, newValue: stayValue(created), reason: ctx.reason, actorId: ctx.actorId });
  await syncMeterCache(tx, [...meterIds], ctx.actorId);
  return { circuitIds: [...circuitIds], meterIds: [...meterIds] };
}

/**
 * Whether a history change would move days under a LOCKED demo — those are
 * refused unless the demo is unlocked (or demo mode is on).
 */
export async function lockedDemosTouched(
  ranges: ReadonlyArray<{ circuitId: string; from: Date; to: Date | null }>,
): Promise<string[]> {
  const demoMode = await isDemoMode();
  if (demoMode) return [];
  const now = new Date();
  const names: string[] = [];
  for (const r of ranges) {
    const demos = await db.circuitDemo.findMany({
      where: { circuitId: r.circuitId, voidedAt: null },
      select: { id: true, sequence: true, preFrom: true, preTo: true, postFrom: true, postTo: true, unlockedUntil: true, circuit: { select: { location: true, lightType: true, siteSurvey: { select: { pipelineId: true } } } } },
    });
    for (const d of demos) {
      const spans = [
        [d.preFrom, d.preTo],
        [d.postFrom, d.postTo],
      ].filter((p): p is [Date, Date] => p[0] !== null && p[1] !== null);
      const touches = spans.some(([a, b]) => dayMs(a) < (r.to?.getTime() ?? Infinity) && r.from.getTime() <= dayMs(b));
      if (!touches) continue;
      const shared = d.circuit.siteSurvey
        ? (await db.demoReport.count({ where: { pipelineId: d.circuit.siteSurvey.pipelineId, status: "shared", demoIds: { has: d.id } } })) > 0
        : false;
      if (!demoLockState({ sharedInReport: shared, unlockedUntil: d.unlockedUntil, demoMode, now }).editable) {
        names.push(`demo ${d.sequence} on ${d.circuit.location || d.circuit.lightType}`);
      }
    }
  }
  return names;
}

/** After the transaction: re-project, refresh unlocked demos, re-derive figures. */
export async function afterHistoryChange(circuitIds: readonly string[], actorId: string | null): Promise<void> {
  const demoMode = await isDemoMode();
  const now = new Date();
  for (const circuitId of new Set(circuitIds)) {
    try {
      await projectCircuitMonitoring(circuitId, actorId);
      const demos = await db.circuitDemo.findMany({
        where: { circuitId, voidedAt: null },
        select: { id: true, unlockedUntil: true, circuit: { select: { siteSurvey: { select: { pipelineId: true } } } } },
      });
      await db.$transaction(
        async (tx) => {
          for (const d of demos) {
            const shared = d.circuit.siteSurvey
              ? (await tx.demoReport.count({ where: { pipelineId: d.circuit.siteSurvey.pipelineId, status: "shared", demoIds: { has: d.id } } })) > 0
              : false;
            if (demoLockState({ sharedInReport: shared, unlockedUntil: d.unlockedUntil, demoMode, now }).editable) {
              await refreshDemoFromMeter(tx, d.id);
            }
          }
          await resyncCircuitFigures(tx, circuitId, actorId);
        },
        { timeout: 60_000, maxWait: 20_000 },
      );
      await syncCircuitBandAlert(circuitId);
      if (actorId) await rederiveInvoiceMonthsForCircuit(circuitId, actorId);
    } catch (err) {
      logger.warn("meter_history.after_change_failed", { circuitId, error: String(err) });
    }
  }
}
