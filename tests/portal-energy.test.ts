import { describe, expect, it } from "vitest";
import { monthlyTotals } from "@/lib/portal-energy";

// monthlyTotals is the one piece of portal-energy.ts pure enough to unit
// test directly (the rest is a DB query) — it is what the dashboard's
// month-over-month delta is computed from, so a wrong bucket here would be
// a wrong "vs last month" shown to a resident.

describe("monthlyTotals", () => {
  it("buckets by month and computes each month's own savings %", () => {
    const daily = [
      { date: "2026-08-05", kWh: 8, baseline: 20 },
      { date: "2026-08-06", kWh: 8, baseline: 20 },
      { date: "2026-09-01", kWh: 6, baseline: 20 },
      { date: "2026-09-02", kWh: 6, baseline: 20 },
    ];
    const months = monthlyTotals(daily);
    expect(months).toEqual([
      { month: "2026-08", kWh: 16, avoidedKwh: 24, savingsPct: 60 },
      { month: "2026-09", kWh: 12, avoidedKwh: 28, savingsPct: 70 },
    ]);
  });

  it("returns months oldest first regardless of input order", () => {
    const daily = [
      { date: "2026-09-01", kWh: 5, baseline: 10 },
      { date: "2026-07-01", kWh: 5, baseline: 10 },
      { date: "2026-08-01", kWh: 5, baseline: 10 },
    ];
    expect(monthlyTotals(daily).map((m) => m.month)).toEqual(["2026-07", "2026-08", "2026-09"]);
  });

  it("a day with no baseline in force contributes kWh but not to the percentage", () => {
    const daily = [
      { date: "2026-08-01", kWh: 5, baseline: 10 },
      { date: "2026-08-02", kWh: 3, baseline: null },
    ];
    const [aug] = monthlyTotals(daily);
    // baseline sum is 10 (only the day that had one), kWh sum is 8
    expect(aug.kWh).toBe(8);
    expect(aug.avoidedKwh).toBe(2);
    expect(aug.savingsPct).toBe(20);
  });

  it("is null, not zero, when no day in the month has a baseline at all", () => {
    const daily = [{ date: "2026-08-01", kWh: 5, baseline: null }];
    expect(monthlyTotals(daily)[0].savingsPct).toBeNull();
  });

  it("an empty series is an empty list, not a fabricated month", () => {
    expect(monthlyTotals([])).toEqual([]);
  });
});
