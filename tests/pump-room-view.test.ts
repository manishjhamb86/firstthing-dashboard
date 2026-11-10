import { describe, expect, it } from "vitest";
import { dayRows, metricSummary, periodTotals, trendData } from "@/lib/pump-room-view";

function row(date: string, dailyKwh: number | null, dailyKl: number | null) {
  return { date: new Date(`${date}T00:00:00Z`), dailyKwh, dailyKl, registerWentBackwards: false, waterWentBackwards: false };
}

describe("trendData", () => {
  it("reverses newest-first readings into oldest-first day/value arrays", () => {
    const t = trendData([row("2026-11-03", 300, 60), row("2026-11-02", 200, 50)]);
    expect(t.days).toEqual(["2026-11-02", "2026-11-03"]);
    expect(t.kwh).toEqual([200, 300]);
    expect(t.kl).toEqual([50, 60]);
    expect(t.efficiency).toEqual([4, 5]);
  });

  it("leaves efficiency null when water is zero or either figure is missing", () => {
    const t = trendData([row("2026-11-02", 200, 0), row("2026-11-01", null, 50)]);
    expect(t.efficiency).toEqual([null, null]);
  });
});

// RG Residency's own first eight days (2–9 Nov 2026), the figures the
// redesign was drawn with.
const DAYS = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09"];
const KWH = [522, 521, 497, 510, 551, 489, 473, 496];
const KL = [889, 934, 895, 954, 977, 873, 846, 839];

describe("metricSummary", () => {
  it("reports the latest day's figure against the mean of the last seven days, the latest included", () => {
    const s = metricSummary(DAYS, KWH);
    expect(s.latestDay).toBe("2026-11-09");
    expect(s.latest).toBe(496);
    expect(s.avg7).toBeCloseTo(3537 / 7, 6); // 3–9 Nov, not 2 Nov
    expect(s.deltaPct).toBeCloseTo((496 / (3537 / 7) - 1) * 100, 6);
  });

  it("skips days with no figure when picking the latest and the window", () => {
    const s = metricSummary(["d1", "d2", "d3"], [100, 120, null]);
    expect(s.latestDay).toBe("d2");
    expect(s.latest).toBe(120);
    expect(s.avg7).toBeCloseTo(110);
  });

  it("has no average or delta below two figures — a one-day average is the day itself", () => {
    expect(metricSummary(["d1"], [100])).toEqual({ latestDay: "d1", latest: 100, avg7: null, deltaPct: null });
    expect(metricSummary(["d1"], [null])).toEqual({ latestDay: null, latest: null, avg7: null, deltaPct: null });
  });
});

describe("periodTotals", () => {
  it("computes the whole-period kWh/KL from the totals, not the mean of daily ratios", () => {
    const t = trendData(DAYS.map((d, i) => row(d, KWH[i], KL[i])).reverse());
    const p = periodTotals(t);
    expect(p.days).toBe(8);
    expect(p.kwh).toBe(4059);
    expect(p.kl).toBe(7207);
    expect(p.overallEfficiency).toBeCloseTo(4059 / 7207, 6);
    const meanOfRatios = t.efficiency.reduce<number>((a, v) => a + (v ?? 0), 0) / 8;
    expect(p.overallEfficiency).not.toBeCloseTo(meanOfRatios, 4);
  });

  it("has no overall efficiency without water", () => {
    const p = periodTotals(trendData([row("2026-11-02", 500, null)]));
    expect(p.kwh).toBe(500);
    expect(p.overallEfficiency).toBeNull();
  });
});

describe("dayRows", () => {
  it("lists newest first and marks only the oldest day as approximate", () => {
    const rows = dayRows(trendData(DAYS.map((d, i) => row(d, KWH[i], KL[i])).reverse()));
    expect(rows[0].day).toBe("2026-11-09");
    expect(rows[0].approximate).toBe(false);
    expect(rows[rows.length - 1].day).toBe("2026-11-02");
    expect(rows[rows.length - 1].approximate).toBe(true);
    expect(rows[0].efficiency).toBeCloseTo(496 / 839);
  });

  it("does not mark an oldest day that carries no figure at all", () => {
    const rows = dayRows(trendData([row("2026-11-03", 500, 900), row("2026-11-02", null, null)]));
    expect(rows[1].approximate).toBe(false);
  });
});
