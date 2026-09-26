import { describe, expect, it } from "vitest";
import {
  benchmarkCeiling,
  describeExclusion,
  excludedKwhAt,
  exclusionOf,
  expectedDisplayedLoadW,
  periodSavingsSummary,
  replacedLightCount,
  savingsPct,
} from "@/lib/circuit-load";
import { demoSavingsPct, deriveCircuitFigures } from "@/lib/circuit-demos";
import { buildDemoReport, type DemoReportCircuitInput } from "@/lib/demo-report";

// The user's rules (2026-09-26):
//  - kept lights that are the SAME item as the replaced ones come off as their
//    share of what the meter measured: X = before ÷ lights × kept;
//  - anything different left on the circuit (street light, fan, TV) comes off
//    at its theoretical draw, count × W × h.

const tube = { deviceTypeId: "tube", name: "Tube light 20W", wattage: 20, hoursPerDay: 24 };

// The Hyde Park demo circuit: 63 tubes, 55 replaced, 8 kept as they were.
const hydePark = exclusionOf([
  { ...tube, count: 55 },
  { ...tube, count: 8, excludedFromCalculation: true },
]);

describe("kept lights of the same kind — share of the measured figure", () => {
  it("X = before ÷ 63 × 8", () => {
    expect(hydePark.share).toBeCloseTo(8 / 63, 12);
    expect(hydePark.fixedKwh).toBe(0);
    expect(excludedKwhAt(28.6633, hydePark)).toBeCloseTo((28.6633 / 63) * 8, 10);
  });

  it("the saving is (before − after) ÷ (before − X)", () => {
    const x = (28.6633 / 63) * 8;
    expect(savingsPct(28.6633, 12.53, hydePark)).toBeCloseTo(((28.6633 - 12.53) / (28.6633 - x)) * 100, 10);
    // 64.47% on the replaced lights, where the gross figure would be 56.28%.
    expect(savingsPct(28.6633, 12.53, hydePark)!.toFixed(2)).toBe("64.47");
    expect(savingsPct(28.6633, 12.53)!.toFixed(2)).toBe("56.29");
  });

  it("a line only partly replaced keeps the rest", () => {
    const partly = exclusionOf([{ ...tube, count: 63, replacementCount: 55 }]);
    expect(partly.share).toBeCloseTo(8 / 63, 12);
    expect(partly.keptLike).toEqual([{ name: "Tube light 20W", count: 8 }]);
  });

  it("demo and circuit figures follow", () => {
    expect(demoSavingsPct(28.6633, 12.53, hydePark)!.toFixed(2)).toBe("64.47");
    const f = deriveCircuitFigures(
      [{ id: "d1", sequence: 1, rejected: false, voided: false, combine: "batch", meteredLightCount: 63, preAverage: 28.6633, postAverage: 12.53 }],
      null,
      hydePark,
    );
    expect(f.benchmark.pct!.toFixed(2)).toBe("64.47");
    expect(f.baseline).toBe(28.6633);
  });
});

describe("different items — theoretical draw", () => {
  const street = exclusionOf([
    { ...tube, count: 93 },
    { deviceTypeId: "street", name: "Street light 50W", count: 7, wattage: 50, hoursPerDay: 12, excludedFromCalculation: true },
  ]);

  it("the saving is extrapolated from the 93 tubes actually replaced", () => {
    expect(replacedLightCount(100, street)).toBe(93);
    expect(replacedLightCount(63, hydePark)).toBe(55);
    // An inventory that is not the metered lights: only kept like-lights come off.
    expect(replacedLightCount(50, street)).toBe(50);
  });

  it("7 street lights at 50 W for 12 h = 4.2 kWh/day, whatever the before figure", () => {
    expect(street.fixedKwh).toBeCloseTo(4.2, 10);
    expect(street.share).toBe(0);
    expect(savingsPct(24, 12, street)).toBeCloseTo((12 / (24 - 4.2)) * 100, 10);
  });

  it("both on one circuit: the item first, then the kept lights' share of the rest", () => {
    const both = exclusionOf([
      { ...tube, count: 55 },
      { ...tube, count: 8, excludedFromCalculation: true },
      { deviceTypeId: "fan", name: "Fan", count: 1, wattage: 60, hoursPerDay: 12, excludedFromCalculation: true },
    ]);
    expect(both.fixedKwh).toBeCloseTo(0.72, 10);
    expect(excludedKwhAt(30, both)).toBeCloseTo(0.72 + (30 - 0.72) * (8 / 63), 10);
  });
});

describe("everything else reads the same rule", () => {
  it("a monitoring month", () => {
    expect(periodSavingsSummary(28.6633, [{ kWh: 12.53 }, { kWh: 12.53 }], hydePark).savingsPct!.toFixed(2)).toBe("64.47");
  });
  it("the ceiling a day must stay under to meet the benchmark", () => {
    const b = 28.6633;
    const x = excludedKwhAt(b, hydePark);
    expect(benchmarkCeiling(b, 64.47, hydePark)).toBeCloseTo(b - 0.6447 * (b - x), 10);
    expect(benchmarkCeiling(100, 60)).toBeCloseTo(40, 10);
  });
  it("no exclusion changes nothing", () => {
    expect(savingsPct(100, 40)).toBe(60);
    // Nothing left to have saved on: the kept load is the whole baseline.
    expect(savingsPct(0.4, 0.4, exclusionOf([{ ...tube, count: 1, excludedFromCalculation: true }]))).toBeNull();
  });
});

describe("the explanation says what was done, with the figures", () => {
  it("Hyde Park", () => {
    const d = describeExclusion(hydePark, 28.6633, 12.53);
    expect(d.lines[0]).toMatch(/8 of the 63 Tube light 20W were kept, not replaced/);
    expect(d.lines[0]).toMatch(/28\.66 ÷ 63 × 8 = 3\.64 kWh\/day/);
    expect(d.formula).toMatch(/\(28\.66 − 12\.53\) ÷ \(28\.66 − 3\.64\) = 64\.5%/);
    expect(d.formula).toMatch(/55 lights that were replaced/);
  });
  it("a different item names its rated draw", () => {
    const d = describeExclusion(exclusionOf([{ ...tube, count: 10 }, { deviceTypeId: "tv", name: "TV", count: 1, wattage: 100, hoursPerDay: 10, excludedFromCalculation: true }]), 10, 4);
    expect(d.lines[0]).toMatch(/1 × TV stays on the circuit .* rated draw comes off: 1\.00 kWh\/day/);
  });
});

describe("the demo report deducts and extrapolates the same way", () => {
  const circuit = (over: Partial<DemoReportCircuitInput> = {}): DemoReportCircuitInput => ({
    id: "c1",
    lightType: "tube",
    location: "Basement",
    meteredLightCount: 63,
    representedLightCount: 1600,
    wattage: 20,
    preInstallBaseline: 28.6633,
    benchmarkSavingsPct: 64.47,
    state: "benchmark_confirmed",
    preInstallReadings: [{ date: "2025-03-10", consumptionKwh: 28.6633 }],
    postInstallReadings: [{ date: "2025-03-24", consumptionKwh: 12.53 }],
    exclusion: hydePark,
    ...over,
  });

  it("measures on the replaced lights and scales by them", () => {
    const r = buildDemoReport({ circuits: [circuit()], societyLightCount: 1600 });
    if (!r.ok) throw new Error(r.blocker);
    expect(r.figures.measuredSavingsPct.toFixed(2)).toBe("64.47");
    const c = r.figures.circuits[0];
    expect(c.excludedKwhPerDay).toBeCloseTo((28.6633 / 63) * 8, 10);
    expect(c.extrapolationFactor).toBeCloseTo(1600 / 55, 10);
  });

  it("a circuit with nothing kept is unchanged", () => {
    const r = buildDemoReport({ circuits: [circuit({ exclusion: undefined, benchmarkSavingsPct: 56 })], societyLightCount: 1600 });
    if (!r.ok) throw new Error(r.blocker);
    expect(r.figures.circuits[0].extrapolationFactor).toBeCloseTo(1600 / 63, 10);
    expect(r.figures.circuits[0].exclusion).toBeUndefined();
  });
});

describe("the meter load test counts every fixture on the circuit", () => {
  it("mixed fixtures add up from the inventory", () => {
    const r = expectedDisplayedLoadW({ meteredLightCount: 100, wattage: 20, devices: [{ count: 93, wattage: 20 }, { count: 7, wattage: 50 }] });
    expect(r).toEqual({ watts: 2210, fromInventory: true });
  });
});
