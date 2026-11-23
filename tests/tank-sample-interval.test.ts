import { describe, expect, it } from "vitest";
import { clampTankInterval, describeTankInterval, refuseTankInterval, thinHistory } from "@/lib/tank-sample-interval";

describe("tank sample interval", () => {
  it("holds a stored value inside 5 minutes to 24 hours", () => {
    expect(clampTankInterval(10)).toBe(10);
    expect(clampTankInterval(1)).toBe(5);
    expect(clampTankInterval(5000)).toBe(1440);
    expect(clampTankInterval(Number.NaN)).toBe(10);
  });
  it("refuses a value it cannot honour", () => {
    expect(refuseTankInterval(10)).toBeNull();
    expect(refuseTankInterval(4)).toMatch(/between 5 minutes/i);
    expect(refuseTankInterval(7.5)).toMatch(/whole number/);
  });
  it("says it in words", () => {
    expect(describeTankInterval(10)).toBe("every 10 minutes");
    expect(describeTankInterval(60)).toBe("every hour");
    expect(describeTankInterval(150)).toBe("every 2 hours 30 minutes");
  });
});

describe("thinHistory", () => {
  const min = 60_000;
  it("keeps recent readings whole and one per half hour before, never dropping a change", () => {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < 12; i++) pts.push([i * 10 * min, i === 4 ? 50 : 25]); // 2 hours at 10-minute steps, one change at 40 min
    const cutoff = 90 * min;
    const out = thinHistory(pts, cutoff);
    // slots 0–30, 30–60, 60–90 keep their first reading, plus the change at 40 and the return at 50; after 90 all kept
    expect(out.map((p) => p[0] / min)).toEqual([0, 30, 40, 50, 60, 90, 100, 110]);
  });
});
