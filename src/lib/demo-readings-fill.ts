/**
 * Filling a demo's days from the meter's hourly store (2026-09-26).
 *
 * "Meter + manual": when the demo meter's hours cover the chosen period, each
 * day is the sum of that day's hours; any day can be typed or corrected by
 * hand on the demo screen, and a hand-entered day keeps the meter's own figure
 * beside it. Changing the period refreshes the meter days; typed days stay.
 *
 * Pure: the action reads the rows, this decides what to write.
 */
import { dayMs, daysOf, type DemoPhase } from "@/lib/demo-periods";

export type HourRow = { day: Date; hour: number; kWh: number };

export type MeterDay = {
  date: Date;
  kWh: number;
  /** Hours the store holds for the day. */
  hoursCovered: number;
  /** Of those, how many carry a non-zero reading — a 0 is an hour the meter was silent. */
  dataHours: number;
};

/** Sum hours into days, within [from, to] inclusive. */
export function meterDays(hours: readonly HourRow[], from: Date, to: Date): MeterDay[] {
  const lo = dayMs(from);
  const hi = dayMs(to);
  const by = new Map<number, MeterDay>();
  for (const h of hours) {
    const t = dayMs(h.day);
    if (t < lo || t > hi) continue;
    const d = by.get(t) ?? { date: new Date(t), kWh: 0, hoursCovered: 0, dataHours: 0 };
    d.kWh += h.kWh;
    d.hoursCovered += 1;
    if (h.kWh !== 0) d.dataHours += 1;
    by.set(t, d);
  }
  return [...by.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Marker on an exclusion the system made (a partial day), so it can lift itself. */
export const AUTO_PARTIAL_PREFIX = "Partial day —";

export function partialReason(d: Pick<MeterDay, "hoursCovered" | "dataHours">): string | null {
  if (d.hoursCovered < 24) return `${AUTO_PARTIAL_PREFIX} the meter file holds ${d.hoursCovered} of 24 hours.`;
  if (d.dataHours === 0) return `${AUTO_PARTIAL_PREFIX} every hour reads zero — the meter was silent.`;
  return null;
}

export type StoredDemoDay = {
  id: string;
  date: Date;
  phase: string;
  kWh: number;
  source: "meter" | "manual" | "demo_generated" | "migrated";
  meterKwh: number | null;
  hoursCovered: number | null;
  dataHours: number | null;
  excludedAt: Date | null;
  excludedById: string | null;
  excludedReason: string | null;
};

export type FillPlan = {
  create: Array<{
    date: Date;
    kWh: number;
    hoursCovered: number;
    dataHours: number;
    excludedReason: string | null;
  }>;
  update: Array<{
    id: string;
    data: Partial<{
      kWh: number;
      meterKwh: number | null;
      hoursCovered: number;
      dataHours: number;
      excludedAt: Date | null;
      excludedReason: string | null;
    }>;
  }>;
  deleteIds: string[];
};

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/**
 * Bring a phase's meter-sourced days in line with the meter store over the
 * period. Typed days are never replaced — only their `meterKwh` is refreshed.
 * Meter days outside the period, or no longer in the store, are removed.
 */
export function planPeriodRefresh(input: {
  phase: DemoPhase;
  period: { from: Date; to: Date } | null;
  existing: readonly StoredDemoDay[];
  meter: readonly MeterDay[];
  now: Date;
}): FillPlan {
  const plan: FillPlan = { create: [], update: [], deleteIds: [] };
  const mine = input.existing.filter((r) => r.phase === input.phase);
  const inPeriod = (d: Date) =>
    input.period !== null && dayMs(d) >= dayMs(input.period.from) && dayMs(d) <= dayMs(input.period.to);
  const byDay = new Map(mine.map((r) => [dayMs(r.date), r]));
  const meterByDay = new Map(input.meter.filter((m) => inPeriod(m.date)).map((m) => [dayMs(m.date), m]));

  for (const [t, m] of meterByDay) {
    const r = byDay.get(t);
    const reason = partialReason(m);
    if (!r) {
      plan.create.push({ date: new Date(t), kWh: m.kWh, hoursCovered: m.hoursCovered, dataHours: m.dataHours, excludedReason: reason });
      continue;
    }
    if (r.source === "meter") {
      const data: FillPlan["update"][number]["data"] = {};
      if (!near(r.kWh, m.kWh)) data.kWh = m.kWh;
      if (r.hoursCovered !== m.hoursCovered) data.hoursCovered = m.hoursCovered;
      if (r.dataHours !== m.dataHours) data.dataHours = m.dataHours;
      const autoExcluded = r.excludedAt !== null && r.excludedById === null && (r.excludedReason ?? "").startsWith(AUTO_PARTIAL_PREFIX);
      if (reason && r.excludedAt === null) {
        data.excludedAt = input.now;
        data.excludedReason = reason;
      } else if (!reason && autoExcluded) {
        // The day filled out — the system's own exclusion lifts; a person's never does.
        data.excludedAt = null;
        data.excludedReason = null;
      }
      if (Object.keys(data).length > 0) plan.update.push({ id: r.id, data });
    } else if (r.meterKwh === null || !near(r.meterKwh, m.kWh)) {
      plan.update.push({ id: r.id, data: { meterKwh: m.kWh, hoursCovered: m.hoursCovered, dataHours: m.dataHours } });
    }
  }

  for (const r of mine) {
    if (r.source !== "meter") continue;
    const t = dayMs(r.date);
    if (!inPeriod(r.date) || !meterByDay.has(t)) plan.deleteIds.push(r.id);
  }
  return plan;
}

/** The days of a period with nothing recorded — what a person may type. */
export function missingDays(period: { from: Date; to: Date }, existing: readonly Pick<StoredDemoDay, "date">[]): Date[] {
  const have = new Set(existing.map((r) => dayMs(r.date)));
  return daysOf(period.from, period.to).filter((d) => !have.has(dayMs(d)));
}
