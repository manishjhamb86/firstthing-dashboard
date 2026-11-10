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
  /** YYYY-MM-DD, oldest first — TrendChart's own expected order. */
  days: string[];
  kwh: (number | null)[];
  kl: (number | null)[];
  /** kWh used per kilolitre pumped — null wherever either figure is missing, or water is zero (not a meaningful denominator). */
  efficiency: (number | null)[];
};

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

/**
 * Indexes a series to its own first real value = 100 — the way to put two
 * measures of different units (kWh, KL) on ONE shared axis without a
 * dual-axis chart (the dataviz skill's own rule: never two y-scales; index
 * to a common base instead). A leading run of nulls has nothing to index
 * against yet, so it stays null until the first real value anchors it.
 */
export function indexToFirst(points: (number | null)[]): (number | null)[] {
  const base = points.find((v): v is number => v !== null && v !== 0);
  if (base === undefined) return points.map(() => null);
  return points.map((v) => (v === null ? null : (v / base) * 100));
}
