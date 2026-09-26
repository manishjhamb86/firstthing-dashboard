/**
 * Refresh a demo's meter-sourced days from the hourly store (2026-09-26).
 *
 * Hours are resolved through the meter HISTORY of the demo's circuit, not the
 * demo's meter pick: whichever meter was on the circuit during the period
 * measured it. Typed days stay; only their meter figure is refreshed.
 */
import type { Tx } from "@/lib/tx";
import { dayMs } from "@/lib/demo-periods";
import { meterDays, planPeriodRefresh, type HourRow, type StoredDemoDay } from "@/lib/demo-readings-fill";

export async function refreshDemoFromMeter(tx: Tx, demoId: string): Promise<{ created: number; updated: number; deleted: number }> {
  const demo = await tx.circuitDemo.findUnique({
    where: { id: demoId },
    select: {
      id: true,
      circuitId: true,
      preFrom: true,
      preTo: true,
      postFrom: true,
      postTo: true,
      readings: true,
    },
  });
  if (!demo) return { created: 0, updated: 0, deleted: 0 };
  const stays = await tx.meterInstallation.findMany({
    where: { circuitId: demo.circuitId },
    select: { meterId: true, installedAt: true, removedAt: true },
  });

  const periods: Array<{ phase: "pre" | "post"; from: Date | null; to: Date | null }> = [
    { phase: "pre", from: demo.preFrom, to: demo.preTo },
    { phase: "post", from: demo.postFrom, to: demo.postTo },
  ];
  const now = new Date();
  let created = 0;
  let updated = 0;
  let deleted = 0;

  for (const p of periods) {
    const period = p.from && p.to ? { from: p.from, to: p.to } : null;
    const hours: Array<HourRow & { meterId: string }> = [];
    if (period) {
      const endExclusive = new Date(dayMs(period.to) + 86_400_000);
      for (const s of stays) {
        const from = new Date(Math.max(s.installedAt.getTime(), dayMs(period.from)));
        const to = new Date(Math.min(s.removedAt?.getTime() ?? Number.POSITIVE_INFINITY, endExclusive.getTime()));
        if (to.getTime() <= from.getTime()) continue;
        const rows = await tx.meterHourlyReading.findMany({
          where: { meterId: s.meterId, day: { gte: from, lt: to } },
          select: { day: true, hour: true, kWh: true },
        });
        for (const r of rows) hours.push({ ...r, meterId: s.meterId });
      }
    }
    const meterOfDay = new Map<number, string>();
    for (const h of hours) if (!meterOfDay.has(dayMs(h.day))) meterOfDay.set(dayMs(h.day), h.meterId);

    const plan = planPeriodRefresh({
      phase: p.phase,
      period,
      existing: demo.readings as StoredDemoDay[],
      meter: period ? meterDays(hours, period.from, period.to) : [],
      now,
    });
    for (const c of plan.create) {
      await tx.circuitDemoReading.create({
        data: {
          demoId,
          date: c.date,
          kWh: c.kWh,
          phase: p.phase,
          source: "meter",
          meterId: meterOfDay.get(dayMs(c.date)) ?? null,
          hoursCovered: c.hoursCovered,
          dataHours: c.dataHours,
          ...(c.excludedReason ? { excludedAt: now, excludedReason: c.excludedReason } : {}),
        },
      });
      created++;
    }
    for (const u of plan.update) {
      await tx.circuitDemoReading.update({ where: { id: u.id }, data: u.data });
      updated++;
    }
    if (plan.deleteIds.length > 0) {
      await tx.circuitDemoReading.deleteMany({ where: { id: { in: plan.deleteIds } } });
      deleted += plan.deleteIds.length;
    }
  }
  return { created, updated, deleted };
}
