import { describe, expect, it } from "vitest";
import { evaluateTankConditions } from "../src/lib/tank-alerts";

const BOUNDS = { lowPct: 20, highPct: 90 };

describe("evaluateTankConditions", () => {
  it("raises nothing for a healthy, reporting tank", () => {
    expect(evaluateTankConditions({ online: true, levelPercent: 55, ...BOUNDS })).toEqual([]);
  });

  it("raises offline and skips level checks when the sensor is not reporting", () => {
    // A level read while offline is the sensor's LAST report, not a fresh
    // one — judging it against the bounds this pass would be a stale
    // reading presented as current.
    expect(evaluateTankConditions({ online: false, levelPercent: 5, ...BOUNDS })).toEqual(["offline"]);
    expect(evaluateTankConditions({ online: false, levelPercent: 95, ...BOUNDS })).toEqual(["offline"]);
  });

  it("raises level_low at or below the low threshold", () => {
    expect(evaluateTankConditions({ online: true, levelPercent: 20, ...BOUNDS })).toEqual(["level_low"]);
    expect(evaluateTankConditions({ online: true, levelPercent: 10, ...BOUNDS })).toEqual(["level_low"]);
    expect(evaluateTankConditions({ online: true, levelPercent: 21, ...BOUNDS })).toEqual([]);
  });

  it("raises level_high at or above the high threshold", () => {
    expect(evaluateTankConditions({ online: true, levelPercent: 90, ...BOUNDS })).toEqual(["level_high"]);
    expect(evaluateTankConditions({ online: true, levelPercent: 100, ...BOUNDS })).toEqual(["level_high"]);
    expect(evaluateTankConditions({ online: true, levelPercent: 89, ...BOUNDS })).toEqual([]);
  });

  it("raises nothing for a tank that has never reported a level at all", () => {
    expect(evaluateTankConditions({ online: true, levelPercent: null, ...BOUNDS })).toEqual([]);
  });

  it("respects configured thresholds, not hardcoded ones", () => {
    expect(evaluateTankConditions({ online: true, levelPercent: 30, lowPct: 35, highPct: 95 })).toEqual(["level_low"]);
    expect(evaluateTankConditions({ online: true, levelPercent: 30, lowPct: 20, highPct: 95 })).toEqual([]);
  });
});
