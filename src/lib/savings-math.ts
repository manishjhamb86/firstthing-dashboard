/**
 * The arithmetic behind a savings figure, in one place.
 *
 * Written against the real Gaur Saundaryam report (2026-08-26) and asserted
 * to reproduce it exactly, because "our number agrees with the document"
 * is only meaningful if the same code can also say when it does not.
 */

/** A day's reading, and whether it can be used. */
export type ReadingAvailability =
  /** A full day the meter recorded. */
  | "available"
  /** The meter was down — the day has no value, which is NOT a value of 0. */
  | "unavailable"
  /** The meter was down for part of the day, so the total understates it. */
  | "partial";

export type DayReading = {
  date: string;
  kwh: number | null;
  availability: ReadingAvailability;
};

/**
 * A fixture on the circuit that was NOT part of the retrofit — the user's
 * "non-installation appliances share this circuit". Gaur Saundaryam's five
 * surface lights are the case: the meter sees them on both sides of the
 * comparison, so their load is deducted from both before savings are
 * computed. Leaving them in understates the saving; deducting from only one
 * side invents one.
 */
export type SharedLoad = {
  label: string;
  count: number;
  watts: number;
  hoursPerDay: number;
};

/** Σ count × watts × hours ÷ 1000. No rounding — this lands in a fee. */
export function sharedLoadKwhPerDay(loads: SharedLoad[]): number {
  return loads.reduce((sum, l) => sum + (l.count * l.watts * l.hoursPerDay) / 1000, 0);
}

/**
 * The average of the days that actually reported.
 *
 * An unavailable day is skipped, never counted as zero: a dead meter reading
 * as 0 kWh would drag an average toward "we saved everything", which is the
 * most dangerous direction for a figure a society is billed on. A partial day
 * is skipped too — its total is real but incomplete, and averaging it in
 * understates the day without saying so.
 */
export function averageOfAvailable(readings: DayReading[]): { average: number | null; used: number; skipped: number } {
  const usable = readings.filter((r) => r.availability === "available" && typeof r.kwh === "number");
  const skipped = readings.length - usable.length;
  if (usable.length === 0) return { average: null, used: 0, skipped };
  const sum = usable.reduce((n, r) => n + (r.kwh as number), 0);
  return { average: sum / usable.length, used: usable.length, skipped };
}

export type Reconciliation = {
  stated: number | null;
  computed: number | null;
  /** Within half of the document's own printed precision. */
  agrees: boolean;
  difference: number | null;
  /** Which one this system would use, and why — the operator still decides. */
  recommend: "computed" | "stated" | "neither";
  reason: string;
};

/**
 * What the document says against what its own rows add up to.
 *
 * The point is not to overrule the document — it is to stop a reader having
 * to notice. Gaur Saundaryam's May table averages to 8.0071 while the
 * sentence beneath it says 8.58, which happens to be the largest single
 * value in that table: somebody copied the wrong cell. A system that silently
 * took either one would have made a billing decision nobody reviewed.
 */
export function reconcileAverage(stated: number | null, readings: DayReading[]): Reconciliation {
  const { average, used } = averageOfAvailable(readings);
  if (average === null) {
    return {
      stated,
      computed: null,
      agrees: false,
      difference: null,
      recommend: stated === null ? "neither" : "stated",
      reason:
        stated === null
          ? "No usable daily readings and no stated average — this window has nothing to average."
          : "No usable daily readings, so the document's figure cannot be checked against anything.",
    };
  }
  if (stated === null) {
    return {
      stated: null,
      computed: average,
      agrees: false,
      difference: null,
      recommend: "computed",
      reason: `The document states no average; computed from ${used} readings it prints.`,
    };
  }
  const difference = Math.abs(stated - average);
  // Documents print to 2 decimals, so a gap under half of the last place is
  // rounding, not disagreement.
  const agrees = difference < 0.005;
  return {
    stated,
    computed: average,
    agrees,
    difference,
    recommend: agrees ? "stated" : "computed",
    reason: agrees
      ? `Matches the ${used} readings the document prints.`
      : `The document says ${stated}, but the ${used} readings it prints average ${average.toFixed(4)}.`,
  };
}

export type SavingsInput = {
  baselineKwhPerDay: number;
  afterKwhPerDay: number;
  /** Deducted from BOTH sides — the meter sees it before and after. */
  sharedLoadKwhPerDay?: number;
};

export type SavingsResult = {
  adjustedBaseline: number;
  adjustedAfter: number;
  savedKwhPerDay: number;
  savingsPct: number;
};

/**
 * CON-10's savings percentage, with the shared load removed from both sides.
 *
 * No rounding anywhere: this figure multiplies into a monthly fee, and a
 * rounded percentage puts the error straight into a rupee amount (INV-02).
 */
export function computeSavings(input: SavingsInput): SavingsResult | { error: string } {
  const shared = input.sharedLoadKwhPerDay ?? 0;
  if (shared < 0) return { error: "Shared load cannot be negative." };
  const adjustedBaseline = input.baselineKwhPerDay - shared;
  const adjustedAfter = input.afterKwhPerDay - shared;
  if (adjustedBaseline <= 0) {
    // Deducting more than the meter ever saw means the shared load is wrong,
    // not that the circuit saved everything.
    return {
      error: `The shared load (${shared} kWh/day) is at or above the baseline itself (${input.baselineKwhPerDay} kWh/day) — check the fixtures recorded as sharing this circuit.`,
    };
  }
  const savedKwhPerDay = adjustedBaseline - adjustedAfter;
  return {
    adjustedBaseline,
    adjustedAfter,
    savedKwhPerDay,
    savingsPct: (savedKwhPerDay / adjustedBaseline) * 100,
  };
}
