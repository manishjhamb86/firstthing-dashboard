import { describe, expect, it } from "vitest";
import { spreadGap } from "@/lib/pump-gap";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("spreadGap", () => {
  it("divides the register rise across the missing days only (RG, 11–16 Nov)", () => {
    // 10 Nov closed at 89,945 kWh / 439,652 KL; 17 Nov's own file opened at, say, 92,900 / 444,950.
    const s = spreadGap({ prevDate: d("2026-11-10"), prevClosingKwh: 89945, prevClosingFlow: 439652, nextDate: d("2026-11-17"), nextOpeningKwh: 92900, nextOpeningFlow: 444950 })!;
    expect(s.dates.map((x) => x.toISOString().slice(0, 10))).toEqual(["2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16"]);
    expect(s.kwhPerDay).toBeCloseTo(2955 / 6, 9);
    expect(s.klPerDay).toBeCloseTo(5298 / 6, 9);
    // The totals are exactly what the meter recorded.
    expect(s.kwhPerDay! * 6).toBeCloseTo(92900 - 89945, 9);
  });
  it("is nothing for consecutive days", () => {
    expect(spreadGap({ prevDate: d("2026-11-09"), prevClosingKwh: 1, prevClosingFlow: 1, nextDate: d("2026-11-10"), nextOpeningKwh: 2, nextOpeningFlow: 2 })).toBeNull();
  });
  it("leaves a metric unspread when the register went backwards, and spreads nothing when both did", () => {
    const s = spreadGap({ prevDate: d("2026-11-01"), prevClosingKwh: 100, prevClosingFlow: 500, nextDate: d("2026-11-04"), nextOpeningKwh: 90, nextOpeningFlow: 530 })!;
    expect(s.kwhPerDay).toBeNull();
    expect(s.klPerDay).toBeCloseTo(15);
    expect(spreadGap({ prevDate: d("2026-11-01"), prevClosingKwh: 100, prevClosingFlow: null, nextDate: d("2026-11-04"), nextOpeningKwh: 90, nextOpeningFlow: null })).toBeNull();
  });
});
