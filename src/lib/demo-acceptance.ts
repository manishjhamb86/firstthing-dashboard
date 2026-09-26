/**
 * "Review, then accept these N days" (2026-09-26). Nothing a demo shows counts
 * until a person accepts it; the accepted set is versioned, and a day changed
 * afterwards marks the set "changed — re-accept" while the accepted figure
 * stays in force until someone does.
 */
import { dayMs } from "@/lib/demo-periods";

export type AcceptanceDay = { date: string; kWh: number; source: string; excluded: boolean };

export type DayRow = {
  date: Date;
  kWh: number;
  source: string;
  excludedAt: Date | null;
};

const iso = (d: Date) => new Date(dayMs(d)).toISOString().slice(0, 10);

/** The snapshot an acceptance stores, and the figure it produces. */
export function acceptanceOf(rows: readonly DayRow[]): {
  days: AcceptanceDay[];
  averageKwh: number | null;
  countedDays: number;
} {
  const days = [...rows]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((r) => ({ date: iso(r.date), kWh: r.kWh, source: r.source, excluded: r.excludedAt !== null }));
  const counted = days.filter((d) => !d.excluded);
  const averageKwh = counted.length === 0 ? null : counted.reduce((s, d) => s + d.kWh, 0) / counted.length;
  return { days, averageKwh, countedDays: counted.length };
}

/** Why a set cannot be accepted, or null. */
export function refuseAcceptance(rows: readonly DayRow[]): string | null {
  const { countedDays } = acceptanceOf(rows);
  if (rows.length === 0) return "There are no days in the period to accept — fill them from the meter or type them first.";
  if (countedDays === 0) return "Every day in the period is excluded — include at least one before accepting.";
  return null;
}

/** Days that differ from what was accepted: added, removed, value or inclusion changed. */
export function changedSince(accepted: readonly AcceptanceDay[] | null, rows: readonly DayRow[]): string[] {
  if (!accepted) return [];
  const now = new Map(acceptanceOf(rows).days.map((d) => [d.date, d]));
  const then = new Map(accepted.map((d) => [d.date, d]));
  const changed = new Set<string>();
  for (const [date, d] of now) {
    const a = then.get(date);
    if (!a || Math.abs(a.kWh - d.kWh) > 1e-9 || a.excluded !== d.excluded) changed.add(date);
  }
  for (const date of then.keys()) if (!now.has(date)) changed.add(date);
  return [...changed].sort();
}
