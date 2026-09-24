import { describe, expect, it } from "vitest";
import { periodComparisons } from "@/lib/meter-view";

// meterHourly() returns most-recent-day-first — these fixtures follow that
// order, since periodComparisons reads hourly[0] as "today".
function day(d: string, total: number, intervalCount = 24) {
  return { day: d, hours: [], total, intervalCount };
}

describe("periodComparisons — a meter's live reading against its baseline", () => {
  it("returns nothing for a meter with no hourly history yet", () => {
    expect(periodComparisons([], 10)).toEqual([]);
  });

  it("windows 'today' from the meter's own latest day, not the wall clock", () => {
    const hourly = [day("2026-09-16", 3, 10)]; // 10 of 24 hours so far
    const out = periodComparisons(hourly, 12); // baseline 12 kWh/day
    const today = out.find((p) => p.key === "today")!;
    expect(today.kWh).toBe(3);
    expect(today.days).toBeCloseTo(10 / 24, 5);
    // Fair comparison: 12 kWh/day scaled to the SAME 10/24 the actual covers.
    expect(today.expectedKwh).toBeCloseTo(5, 5);
    expect(today.savingsPct).toBeCloseTo(40, 5); // (5-3)/5 * 100
  });

  it("omits 'yesterday' when the day before the latest is not in the store", () => {
    const hourly = [day("2026-09-16", 3)];
    const out = periodComparisons(hourly, 10);
    expect(out.find((p) => p.key === "yesterday")).toBeUndefined();
  });

  it("includes 'yesterday' when it is present, as a full day", () => {
    const hourly = [day("2026-09-16", 3), day("2026-09-15", 8)];
    const out = periodComparisons(hourly, 10);
    const yest = out.find((p) => p.key === "yesterday")!;
    expect(yest.kWh).toBe(8);
    expect(yest.days).toBe(1);
    expect(yest.expectedKwh).toBe(10);
  });

  it("sums the 7 most recent days for 'week', gaps and all", () => {
    const hourly = [
      day("2026-09-16", 1),
      day("2026-09-15", 2),
      day("2026-09-13", 3), // the 14th is missing — a real gap
      day("2026-09-12", 4),
      day("2026-09-11", 5),
      day("2026-09-10", 6),
      day("2026-09-09", 7),
      day("2026-09-08", 8), // the 8th falls outside the 7 most recent
    ];
    const out = periodComparisons(hourly, 1);
    const week = out.find((p) => p.key === "week")!;
    expect(week.kWh).toBe(1 + 2 + 3 + 4 + 5 + 6 + 7);
    expect(week.days).toBe(7);
  });

  it("sums only the days sharing the latest day's calendar month for 'month'", () => {
    const hourly = [day("2026-09-02", 5), day("2026-09-01", 4), day("2026-08-31", 9)];
    const out = periodComparisons(hourly, 1);
    const month = out.find((p) => p.key === "month")!;
    expect(month.kWh).toBe(9); // 5 + 4, the 31 Aug day excluded
  });

  it("reports no expected figure and no band with no baseline to compare against", () => {
    const out = periodComparisons([day("2026-09-16", 3)], null);
    const today = out.find((p) => p.key === "today")!;
    expect(today.expectedKwh).toBeNull();
    expect(today.savingsPct).toBeNull();
    expect(today.band).toBeNull();
  });
});
