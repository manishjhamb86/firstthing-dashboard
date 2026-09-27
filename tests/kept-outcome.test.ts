import { describe, expect, it } from "vitest";
import {
  benchmarkCeiling,
  describeExclusion,
  exclusionFromDevices,
  hasExclusion,
  replacedLightCount,
  savingsPct,
} from "@/lib/circuit-load";

// Hyde Park's demo circuit: 63 × 20W tubes on 24h, 55 replaced at the demo,
// 8 kept. Baseline 28.66 kWh/day, a monitoring day of 8.30.
const B = 28.66;
const DAY = 8.3;
const line = (extra: Record<string, unknown> = {}) => ({
  count: 63,
  wattage: 20,
  hoursPerDay: 24,
  excludedFromCalculation: false,
  deviceTypeId: "tube20",
  replacementCount: 55,
  deviceType: { name: "Tube light 20W" },
  ...extra,
});
const recorded = (replaced: number, removed: number) =>
  line({ keptReplacedCount: replaced, keptRemovedCount: removed, keptRecordedAt: new Date("2025-07-05") });

describe("kept fixtures recorded at the full installation (2026-09-27)", () => {
  it("as at the demo, the 8 kept come off both sides — the demo's own figure", () => {
    const ex = exclusionFromDevices([recorded(8, 0)], "demo");
    expect(savingsPct(B, DAY, ex)!).toBeCloseTo(((B - DAY) / (B - (B / 63) * 8)) * 100, 6);
    expect(replacedLightCount(63, ex)).toBe(55);
  });

  it("not recorded yet: monitoring carries the demo's deduction on", () => {
    const demo = exclusionFromDevices([line()], "demo");
    const mon = exclusionFromDevices([line()], "monitoring");
    expect(savingsPct(B, DAY, mon)).toBeCloseTo(savingsPct(B, DAY, demo)!, 10);
  });

  it("all 8 replaced at the full installation: nothing deducted, the saving is on all 63", () => {
    const ex = exclusionFromDevices([recorded(8, 0)], "monitoring");
    expect(hasExclusion(ex)).toBe(false);
    expect(savingsPct(B, DAY, ex)!).toBeCloseTo(((B - DAY) / B) * 100, 6); // 71.04%
    expect(replacedLightCount(63, ex)).toBe(63);
    expect(benchmarkCeiling(B, 64.47, ex)).toBeCloseTo(B * (1 - 0.6447), 6);
    expect(ex.replacedLater).toEqual([{ name: "Tube light 20W", count: 8 }]);
  });

  it("some replaced, the rest kept: only the rest is deducted", () => {
    const ex = exclusionFromDevices([recorded(5, 0)], "monitoring");
    const x = (B / 63) * 3;
    expect(savingsPct(B, DAY, ex)!).toBeCloseTo(((B - DAY) / (B - x)) * 100, 6);
    expect(replacedLightCount(63, ex)).toBe(60);
  });

  it("taken off the circuit: deducted from the before side only", () => {
    const ex = exclusionFromDevices([recorded(0, 8)], "monitoring");
    const xr = (B / 63) * 8;
    expect(savingsPct(B, DAY, ex)!).toBeCloseTo(((B - xr - DAY) / (B - xr)) * 100, 6); // 66.8%
    expect(replacedLightCount(63, ex)).toBe(55);
    // The ceiling is on the circuit as it now stands.
    expect(benchmarkCeiling(B, 64.47, ex)).toBeCloseTo(B - xr - 0.6447 * (B - xr), 6);
    const d = describeExclusion(ex, B, DAY);
    expect(d.lines.join(" ")).toMatch(/taken off the circuit/);
    expect(d.formula).toMatch(/28\.66 − 3\.64 − 8\.30/);
  });

  it("a different item replaced later stops being deducted too", () => {
    const street = {
      count: 7, wattage: 50, hoursPerDay: 12, excludedFromCalculation: true, deviceTypeId: "street50",
      replacementCount: null, deviceType: { name: "Street light 50W" },
      keptReplacedCount: 7, keptRemovedCount: 0, keptRecordedAt: new Date("2025-07-05"),
    };
    const tubes = { ...line(), count: 93, replacementCount: 93 };
    expect(hasExclusion(exclusionFromDevices([tubes, street], "demo"))).toBe(true);
    expect(hasExclusion(exclusionFromDevices([tubes, street], "monitoring"))).toBe(false);
  });
});

import { keptStory } from "@/lib/circuit-load";

describe("keptStory — what the portal says about kept fixtures", () => {
  it("before anything is recorded, the demo's deduction carries on and says so", () => {
    const demo = exclusionFromDevices([line()], "demo");
    const s = keptStory(demo, exclusionFromDevices([line()], "monitoring"), false, 63)!;
    expect(s.atDemo).toMatch(/8 of the 63 Tube light 20W were kept/);
    expect(s.atDemo).toMatch(/on the 55 replaced/);
    expect(s.afterFull).toMatch(/Not yet recorded/);
  });

  it("all replaced at the full installation: nothing is left out, on all 63", () => {
    const s = keptStory(exclusionFromDevices([recorded(8, 0)], "demo"), exclusionFromDevices([recorded(8, 0)], "monitoring"), true, 63)!;
    expect(s.afterFull).toMatch(/8 × Tube light 20W replaced with energy-saving lights/);
    expect(s.afterFull).toMatch(/nothing is left out: the saving is on all 63 lights/);
  });

  it("taken off: says the saving is on the circuit as it now stands", () => {
    const s = keptStory(exclusionFromDevices([recorded(0, 8)], "demo"), exclusionFromDevices([recorded(0, 8)], "monitoring"), true, 63)!;
    expect(s.afterFull).toMatch(/taken off the circuit/);
    expect(s.afterFull).toMatch(/as it now stands/);
  });

  it("a demo that left nothing out has no story", () => {
    expect(keptStory(exclusionFromDevices([line({ replacementCount: 63 })]), exclusionFromDevices([line({ replacementCount: 63 })], "monitoring"), false, 63)).toBeNull();
  });
});
