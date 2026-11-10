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

export type DailyBar = { day: string; total: number; intervalCount: number };

// DailyBars (src/components/meter-ui.tsx) expects newest-first input (it
// reverses internally) and renders anything with intervalCount < 24 as a
// flagged, amber "partial" bar rather than a quiet zero — reused here for
// the same reason it already serves meter readings: a day with no real
// figure must never look like a day of zero consumption.
export function electricityBars(readings: PumpRoomReadingRow[]): DailyBar[] {
  return readings.map((r) => ({
    day: r.date.toISOString().slice(0, 10),
    total: r.dailyKwh ?? 0,
    intervalCount: r.registerWentBackwards || r.dailyKwh === null ? 0 : 24,
  }));
}

export function waterBars(readings: PumpRoomReadingRow[]): DailyBar[] {
  return readings.map((r) => ({
    day: r.date.toISOString().slice(0, 10),
    total: r.dailyKl ?? 0,
    intervalCount: r.waterWentBackwards || r.dailyKl === null ? 0 : 24,
  }));
}

export type EfficiencyRow = { day: string; kwhPerKl: number | null };

/**
 * Energy used per kilolitre pumped — the real operational question a pump
 * room answers (2026-11-10, user-asked). Only computed where both figures
 * are real for the same day; a missing or zero water figure is not a
 * meaningful denominator and must not produce an undefined or infinite
 * ratio.
 */
export function efficiencyRows(readings: PumpRoomReadingRow[]): EfficiencyRow[] {
  return readings.map((r) => ({
    day: r.date.toISOString().slice(0, 10),
    kwhPerKl: r.dailyKwh !== null && r.dailyKl !== null && r.dailyKl > 0 ? r.dailyKwh / r.dailyKl : null,
  }));
}
