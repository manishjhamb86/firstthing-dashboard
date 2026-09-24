import { describe, expect, it } from "vitest";
import { periodComparisons } from "@/lib/meter-view";

// meterHourly() returns most-recent-day-first.
function day(d: string, total: number, intervalCount = 24) {
  return { day: d, hours: [], total, intervalCount };
}
// 24 Sept 2026, 12:00 IST (06:30 UTC).
const NOW = new Date("2026-09-24T06:30:00Z");
const READ = new Date("2026-09-24T06:00:00Z"); // 11:30 IST
const live = { dayKwh: 2.01, monthKwh: 74.3, readAt: READ };
const get = (out: ReturnType<typeof periodComparisons>, k: string) => out.find((p) => p.key === k)!;

describe("periodComparisons — each period from the source that holds it", () => {
  it("takes today from the meter's own live counter, never from an old uploaded day", () => {
    // History ends on the 16th — the reported bug labelled the 16th as today.
    const out = periodComparisons([day("2026-09-16", 2.29, 18)], 30, live, NOW);
    const today = get(out, "today");
    expect(today.kWh).toBe(2.01);
    expect(today.days).toBeCloseTo(11.5 / 24, 5);
    expect(today.expectedKwh).toBeCloseTo(30 * (11.5 / 24), 5);
  });

  it("shows no 'today' figure when the meter has not been read today", () => {
    const out = periodComparisons([], 30, { ...live, readAt: new Date("2026-09-23T06:00:00Z") }, NOW);
    expect(get(out, "today").kWh).toBeNull();
    expect(get(out, "today").note).toBe("not read yet today");
  });

  it("says where history ends instead of substituting an older day for yesterday", () => {
    const out = periodComparisons([day("2026-09-16", 5)], 30, live, NOW);
    const y = get(out, "yesterday");
    expect(y.kWh).toBeNull();
    expect(y.note).toBe("uploaded history ends 16-09-2026");
  });

  it("uses yesterday's uploaded day when history reaches it", () => {
    const out = periodComparisons([day("2026-09-23", 8)], 10, live, NOW);
    const y = get(out, "yesterday");
    expect(y.kWh).toBe(8);
    expect(y.expectedKwh).toBe(10);
    expect(y.savingsPct).toBeCloseTo(20, 5);
  });

  it("sums only the seven days before today for the week, and says how many were recorded", () => {
    const out = periodComparisons([day("2026-09-23", 1), day("2026-09-22", 2), day("2026-09-10", 99)], 10, live, NOW);
    const w = get(out, "week");
    expect(w.kWh).toBe(3); // the 10th is outside the week
    expect(w.days).toBe(2);
    expect(w.note).toContain("2 of 7 days recorded");
  });

  it("takes this month from the meter's own month counter, scaled to the days elapsed", () => {
    const out = periodComparisons([], 10, live, NOW);
    const m = get(out, "month");
    expect(m.kWh).toBe(74.3);
    expect(m.days).toBeCloseTo(23 + 11.5 / 24, 5);
  });

  it("reports no expected figure with no baseline", () => {
    const out = periodComparisons([], null, live, NOW);
    expect(get(out, "today").expectedKwh).toBeNull();
    expect(get(out, "today").band).toBeNull();
  });
});
