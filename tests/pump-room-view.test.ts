import { describe, expect, it } from "vitest";
import { indexToFirst, trendData } from "@/lib/pump-room-view";

describe("indexToFirst", () => {
  it("indexes every value to the first real one = 100", () => {
    const [a, b, c] = indexToFirst([200, 220, 180]);
    expect(a).toBeCloseTo(100);
    expect(b).toBeCloseTo(110);
    expect(c).toBeCloseTo(90);
  });

  it("skips a leading null until the first real value anchors the series", () => {
    expect(indexToFirst([null, 200, 300])).toEqual([null, 100, 150]);
  });

  it("keeps a null in place once anchored", () => {
    expect(indexToFirst([200, null, 400])).toEqual([100, null, 200]);
  });

  it("returns all nulls when nothing can anchor the series (no non-zero value at all)", () => {
    expect(indexToFirst([null, null])).toEqual([null, null]);
    expect(indexToFirst([0, 0])).toEqual([null, null]);
  });

  it("skips a leading zero to find a usable anchor, but still indexes the zero point itself (a real zero reading, not a gap)", () => {
    expect(indexToFirst([0, 200, 300])).toEqual([0, 100, 150]);
  });
});

describe("trendData", () => {
  it("reverses newest-first readings into oldest-first day/value arrays", () => {
    const readings = [
      { date: new Date("2026-11-03T00:00:00Z"), dailyKwh: 300, dailyKl: 60, registerWentBackwards: false, waterWentBackwards: false },
      { date: new Date("2026-11-02T00:00:00Z"), dailyKwh: 200, dailyKl: 50, registerWentBackwards: false, waterWentBackwards: false },
    ];
    const t = trendData(readings);
    expect(t.days).toEqual(["2026-11-02", "2026-11-03"]);
    expect(t.kwh).toEqual([200, 300]);
    expect(t.kl).toEqual([50, 60]);
    expect(t.efficiency).toEqual([4, 5]);
  });

  it("leaves efficiency null when water is zero or either figure is missing", () => {
    const readings = [
      { date: new Date("2026-11-02T00:00:00Z"), dailyKwh: 200, dailyKl: 0, registerWentBackwards: false, waterWentBackwards: false },
      { date: new Date("2026-11-01T00:00:00Z"), dailyKwh: null, dailyKl: 50, registerWentBackwards: false, waterWentBackwards: false },
    ];
    const t = trendData(readings);
    expect(t.efficiency).toEqual([null, null]);
  });
});
