// FEAT-046 / CON-12 — aggregation, coverage, and the 20-day floor.
//
// The rule this module exists to make unavoidable: a month is never silently
// treated as complete, and a missing day is never invented. FLOW-09 step 7 is
// explicit that no coverage level licenses interpolation, so there is
// deliberately no function here that fills a gap — the closest thing on offer
// is a mean over the days that actually have data, and it always arrives with
// the coverage attached to it.

import { daysInPeriod, utcDayOf } from "./reading-normalize";

/** CON-12's floor, set at the Phase 3 gate. */
export const COVERAGE_FLOOR_DAYS = 20;

export type CoverageDay = {
  date: Date;
  kWh: number;
  /** Excluded by an explicit decision — does not count toward coverage. */
  excluded?: boolean;
};

export type Coverage = {
  coverageDays: number;
  daysInMonth: number;
  /** Every day of the month has a usable reading. */
  complete: boolean;
  /** Below CON-12's 20-day floor. */
  belowFloor: boolean;
};

export function coverageOf(days: CoverageDay[], period: string): Coverage {
  const daysInMonth = daysInPeriod(period);
  const usable = new Set(
    days.filter((d) => !d.excluded).map((d) => utcDayOf(d.date).getTime()),
  );
  const coverageDays = usable.size;
  return {
    coverageDays,
    daysInMonth,
    complete: coverageDays === daysInMonth,
    belowFloor: coverageDays < COVERAGE_FLOOR_DAYS,
  };
}

export type MonthlyFigure = {
  totalKwh: number;
  meanDailyKwh: number;
  coverage: Coverage;
};

/**
 * The month's figure, or null when there is no honest one to give.
 *
 * Null happens in exactly two cases, and the distinction matters to the
 * caller because they read differently on screen:
 *   - no readings at all → "no data", never 0 kWh (FEAT-046-AC-2). A zero
 *     would be a claim about consumption; the absence of readings is a claim
 *     about our records.
 *   - below the 20-day floor and not explicitly accepted → the system
 *     declines to compute a billing-grade comparison unprompted
 *     (FEAT-046-AC-5). PER-01 can still accept the month, which is a recorded
 *     act with an owner (`CoverageAcceptance`), not a silent fallback.
 */
export function monthlyFigure(
  days: CoverageDay[],
  period: string,
  opts: { coverageAccepted?: boolean } = {},
): MonthlyFigure | null {
  const live = days.filter((d) => !d.excluded);
  const coverage = coverageOf(days, period);
  if (live.length === 0) return null;
  if (coverage.belowFloor && !opts.coverageAccepted) return null;

  const totalKwh = live.reduce((n, d) => n + d.kWh, 0);
  return {
    totalKwh,
    // Deliberately over the days that *have* data, not over the calendar
    // month — CON-12's "remaining days' readings are used for the monthly
    // comparison". Dividing by 31 when 24 days reported would understate
    // consumption by the exact shape of the gap.
    meanDailyKwh: totalKwh / live.length,
    coverage,
  };
}

export function describeCoverage(c: Coverage): string {
  if (c.complete) return `${c.coverageDays} / ${c.daysInMonth} days — complete`;
  if (c.belowFloor) {
    return `${c.coverageDays} / ${c.daysInMonth} days — below CON-12's ${COVERAGE_FLOOR_DAYS}-day floor`;
  }
  return `${c.coverageDays} / ${c.daysInMonth} days`;
}
