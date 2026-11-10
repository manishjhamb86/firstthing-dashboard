/**
 * The shared read-side view of a pump room's daily history — used by both
 * the admin detail page and the portal section, so the two surfaces can
 * never disagree about what a day's figures mean (the same rule
 * src/lib/meter-view.ts already follows for the meter module).
 */

export type PumpRoomReadingRow = {
  date: Date;
  dailyKwh: number | null;
  dailyKl: number | null;
  registerWentBackwards: boolean;
  waterWentBackwards: boolean;
};

export type TrendData = {
  /** YYYY-MM-DD, oldest first. */
  days: string[];
  kwh: (number | null)[];
  kl: (number | null)[];
  /** kWh used per kilolitre pumped — null wherever either figure is missing, or water is zero (not a meaningful denominator). */
  efficiency: (number | null)[];
};

/**
 * Specific energy of urban water pumping, kWh per kilolitre (= kWh/m³):
 * CPHEEO's water-supply manual puts the typical range at 0.25–0.50, with
 * ~0.20 for an efficient system and ~0.60 for a poor one. A reference
 * band for the chart, not a contractual figure — the boundary here is the
 * room's backup energy meter, so standby draw is inside it.
 */
export const TYPICAL_SPECIFIC_ENERGY = { low: 0.25, high: 0.5 } as const;

/** The vendor sends one report a day; two missed days means the feed, not the day, needs a look. */
export const REPORTING_WITHIN_MS = 48 * 60 * 60 * 1000;

export function isReporting(lastReadingAt: Date | null, now: Date = new Date()): boolean {
  return lastReadingAt !== null && now.getTime() - lastReadingAt.getTime() < REPORTING_WITHIN_MS;
}

/** `readings` arrives newest-first (every caller fetches it that way); this reverses once, here, rather than in every page. */
export function trendData(readings: PumpRoomReadingRow[]): TrendData {
  const ordered = [...readings].reverse();
  return {
    days: ordered.map((r) => r.date.toISOString().slice(0, 10)),
    kwh: ordered.map((r) => r.dailyKwh),
    kl: ordered.map((r) => r.dailyKl),
    efficiency: ordered.map((r) => (r.dailyKwh !== null && r.dailyKl !== null && r.dailyKl > 0 ? r.dailyKwh / r.dailyKl : null)),
  };
}

export type MetricSummary = {
  /** The most recent day that actually has a figure, and that figure. */
  latestDay: string | null;
  latest: number | null;
  /** Mean of the last 7 days that have a figure (the latest included) — null below 2 such days, since "vs average" of one day is the day itself. */
  avg7: number | null;
  /** latest ÷ avg7 − 1, as a percentage; null whenever either side is. */
  deltaPct: number | null;
};

/** The headline a metric block carries: yesterday's figure and how it sits against the recent week. */
export function metricSummary(days: string[], points: (number | null)[]): MetricSummary {
  const present: { day: string; v: number }[] = [];
  points.forEach((v, i) => {
    if (v !== null) present.push({ day: days[i], v });
  });
  if (present.length === 0) return { latestDay: null, latest: null, avg7: null, deltaPct: null };
  const last = present[present.length - 1];
  const window = present.slice(-7);
  if (window.length < 2) return { latestDay: last.day, latest: last.v, avg7: null, deltaPct: null };
  const avg7 = window.reduce((a, p) => a + p.v, 0) / window.length;
  return { latestDay: last.day, latest: last.v, avg7, deltaPct: avg7 === 0 ? null : (last.v / avg7 - 1) * 100 };
}

export type PeriodTotals = {
  days: number;
  kwh: number;
  kl: number;
  /** Total kWh ÷ total KL — the whole-period specific energy. Deliberately NOT the mean of the daily ratios, which weights a quiet day the same as a busy one. Null without both totals. */
  overallEfficiency: number | null;
};

export function periodTotals(trend: TrendData): PeriodTotals {
  const kwh = trend.kwh.reduce<number>((a, v) => a + (v ?? 0), 0);
  const kl = trend.kl.reduce<number>((a, v) => a + (v ?? 0), 0);
  const bothCounted = trend.kwh.some((v, i) => v !== null && trend.kl[i] !== null);
  return { days: trend.days.length, kwh, kl, overallEfficiency: bothCounted && kl > 0 ? kwh / kl : null };
}

export type DayRow = {
  day: string;
  kwh: number | null;
  kl: number | null;
  efficiency: number | null;
  /** The oldest day on record has no earlier day to diff against — its figure is its own opening-to-closing span (see deriveDailyFigure), an approximation the table marks rather than hides. */
  approximate: boolean;
};

/** The day-by-day readout, newest first — on a phone there is no hover, so this IS where every figure is read. */
export function dayRows(trend: TrendData): DayRow[] {
  const rows = trend.days.map((day, i) => ({
    day,
    kwh: trend.kwh[i],
    kl: trend.kl[i],
    efficiency: trend.efficiency[i],
    approximate: i === 0 && (trend.kwh[i] !== null || trend.kl[i] !== null),
  }));
  return rows.reverse();
}
