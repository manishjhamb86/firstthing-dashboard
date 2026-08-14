import { describe, expect, it } from "vitest";
import {
  COVERAGE_FLOOR_DAYS,
  coverageOf,
  describeCoverage,
  monthlyFigure,
} from "@/lib/reading-coverage";

const day = (n: number) => new Date(Date.UTC(2026, 6, n)); // July 2026, 31 days

function month(days: number, kWh = 40) {
  return Array.from({ length: days }, (_, i) => ({ date: day(i + 1), kWh }));
}

describe("CON-12's floor", () => {
  it("is 20 days", () => {
    expect(COVERAGE_FLOOR_DAYS).toBe(20);
  });
});

describe("coverageOf", () => {
  it("reports a complete month as complete", () => {
    const c = coverageOf(month(31), "2026-07");
    expect(c).toEqual({ coverageDays: 31, daysInMonth: 31, complete: true, belowFloor: false });
  });

  it("does not count an excluded day toward coverage", () => {
    const days = month(31).map((d, i) => (i === 0 ? { ...d, excluded: true } : d));
    const c = coverageOf(days, "2026-07");
    expect(c.coverageDays).toBe(30);
    expect(c.complete).toBe(false);
  });

  it("counts a day once however many rows mention it", () => {
    const c = coverageOf([...month(3), ...month(3)], "2026-07");
    expect(c.coverageDays).toBe(3);
  });

  it("puts exactly 20 days above the floor, not below it", () => {
    expect(coverageOf(month(20), "2026-07").belowFloor).toBe(false);
    expect(coverageOf(month(19), "2026-07").belowFloor).toBe(true);
  });
});

describe("monthlyFigure — FEAT-046", () => {
  it("AC-1: a full month produces totals with coverage recorded as complete", () => {
    const f = monthlyFigure(month(31, 40), "2026-07");
    expect(f).not.toBeNull();
    expect(f!.totalKwh).toBe(1240);
    expect(f!.meanDailyKwh).toBe(40);
    expect(f!.coverage.complete).toBe(true);
  });

  it("AC-2: no readings is 'no data', never zero consumption", () => {
    expect(monthlyFigure([], "2026-07")).toBeNull();
  });

  it("AC-3: 6 missing days are excluded and the mean comes from the rest", () => {
    // 25 of 31 days at 40 kWh. The mean must be 40 — dividing the total by
    // 31 would understate the daily figure by exactly the shape of the gap.
    const f = monthlyFigure(month(25, 40), "2026-07");
    expect(f!.totalKwh).toBe(1000);
    expect(f!.meanDailyKwh).toBe(40);
    expect(f!.coverage.coverageDays).toBe(25);
    expect(f!.coverage.daysInMonth).toBe(31);
  });

  it("AC-5: below the floor, no figure is computed unprompted", () => {
    expect(monthlyFigure(month(19, 40), "2026-07")).toBeNull();
  });

  it("AC-5: an explicit acceptance is what unlocks it", () => {
    const f = monthlyFigure(month(19, 40), "2026-07", { coverageAccepted: true });
    expect(f).not.toBeNull();
    expect(f!.coverage.belowFloor).toBe(true);
    expect(f!.meanDailyKwh).toBe(40);
  });

  it("accepting coverage on a month with no readings still yields no figure", () => {
    // Acceptance says "bill on partial data", not "bill on none".
    expect(monthlyFigure([], "2026-07", { coverageAccepted: true })).toBeNull();
  });

  it("does not round the mean", () => {
    const days = [
      { date: day(1), kWh: 41.111 },
      { date: day(2), kWh: 42.222 },
      { date: day(3), kWh: 43.333 },
    ];
    const f = monthlyFigure(days, "2026-07", { coverageAccepted: true });
    expect(f!.meanDailyKwh).toBeCloseTo(42.222, 10);
    expect(f!.totalKwh).toBeCloseTo(126.666, 10);
  });
});

describe("describeCoverage", () => {
  it("says which of the three things it is", () => {
    expect(describeCoverage(coverageOf(month(31), "2026-07"))).toContain("complete");
    expect(describeCoverage(coverageOf(month(25), "2026-07"))).toBe("25 / 31 days");
    expect(describeCoverage(coverageOf(month(14), "2026-07"))).toContain("below CON-12's 20-day floor");
  });
});
