import { describe, expect, it } from "vitest";
import { excludedDailyKwh, expectedDisplayedLoadW, periodSavingsSummary, savingsPct } from "@/lib/circuit-load";
import { demoSavingsPct, deriveCircuitFigures } from "@/lib/circuit-demos";
import { buildDemoReport, type DemoReportCircuitInput } from "@/lib/demo-report";

// Fixtures left on a circuit unreplaced (2026-09-26, user-specified): their
// draw comes off BOTH the before and after averages before a saving is taken.
// Worked example: the meter reads 100 kWh/day before and 40 after; 20 of each
// is street lights nobody replaced. The replaced lights went 80 → 20: 75%.

describe("the excluded load comes off both sides", () => {
  it("a day's saving is on the replaced lights only", () => {
    expect(savingsPct(100, 40, 20)).toBe(75);
    // Without exclusions, unchanged.
    expect(savingsPct(100, 40)).toBe(60);
  });

  it("refuses a figure when the excluded load is all the baseline", () => {
    expect(savingsPct(20, 20, 20)).toBeNull();
    expect(demoSavingsPct(20, 20, 25)).toBeNull();
  });

  it("a demo's saving uses the same rule", () => {
    expect(demoSavingsPct(100, 40, 20)).toBe(75);
    expect(demoSavingsPct(100, 40)).toBe(60);
  });

  it("the circuit benchmark follows", () => {
    const f = deriveCircuitFigures(
      [{ id: "d1", sequence: 1, rejected: false, voided: false, combine: "batch", meteredLightCount: 100, preAverage: 100, postAverage: 40 }],
      null,
      20,
    );
    expect(f.benchmark.pct).toBe(75);
    // The baseline stays what the meter measured: monitoring days are read
    // by the same meter, and they subtract the same load.
    expect(f.baseline).toBe(100);
  });

  it("a monitoring period is judged the same way", () => {
    const s = periodSavingsSummary(100, [{ kWh: 40 }, { kWh: 40 }], 20);
    expect(s.savingsPct).toBe(75);
  });

  it("the excluded load is Σ count × W × h of the excluded lines only", () => {
    expect(
      excludedDailyKwh([
        { count: 7, wattage: 50, hoursPerDay: 12, excludedFromCalculation: true },
        { count: 93, wattage: 20, hoursPerDay: 24 },
      ]),
    ).toBeCloseTo(4.2, 10);
  });
});

describe("the demo report states and uses the excluded load", () => {
  const circuit = (over: Partial<DemoReportCircuitInput> = {}): DemoReportCircuitInput => ({
    id: "c1",
    lightType: "tube",
    location: "Basement",
    meteredLightCount: 100,
    representedLightCount: 930,
    wattage: 20,
    preInstallBaseline: 100,
    benchmarkSavingsPct: 75,
    state: "benchmark_confirmed",
    preInstallReadings: [{ date: "2026-09-01", consumptionKwh: 100 }],
    postInstallReadings: [{ date: "2026-09-10", consumptionKwh: 40 }],
    excludedDevices: [{ name: "Street light 50W", count: 7, wattage: 50, kWhPerDay: 20 }],
    ...over,
  });

  it("measures and agrees on the replaced lights", () => {
    const r = buildDemoReport({ circuits: [circuit()], societyLightCount: 930 });
    if (!r.ok) throw new Error(r.blocker);
    expect(r.figures.measuredSavingsPct).toBe(75);
    expect(r.figures.agreedSavingsPct).toBe(75);
    const c = r.figures.circuits[0];
    expect(c.excludedKwhPerDay).toBe(20);
    // 80 kWh/day of replaced lights × 75% = 60 saved on the demo lights.
    expect(c.agreedSavedKwhPerDay).toBe(60);
    // Scaled by the 93 lights replaced, not the 100 on the circuit.
    expect(c.extrapolationFactor).toBe(930 / 93);
  });

  it("a circuit with nothing excluded is unchanged", () => {
    const r = buildDemoReport({ circuits: [circuit({ excludedDevices: [], benchmarkSavingsPct: 60 })], societyLightCount: 930 });
    if (!r.ok) throw new Error(r.blocker);
    expect(r.figures.measuredSavingsPct).toBe(60);
    expect(r.figures.circuits[0].extrapolationFactor).toBe(9.3);
    expect(r.figures.circuits[0].excludedDevices).toBeUndefined();
  });
});


describe("the meter load test counts every fixture on the circuit", () => {
  it("mixed fixtures add up from the inventory", () => {
    const r = expectedDisplayedLoadW({ meteredLightCount: 100, wattage: 20, devices: [{ count: 93, wattage: 20 }, { count: 7, wattage: 50 }] });
    expect(r).toEqual({ watts: 2210, fromInventory: true });
  });
  it("an inventory that is not the demo's lights falls back to lights × wattage", () => {
    expect(expectedDisplayedLoadW({ meteredLightCount: 50, wattage: 20, devices: [{ count: 93, wattage: 20 }] })).toEqual({ watts: 1000, fromInventory: false });
    expect(expectedDisplayedLoadW({ meteredLightCount: 50, wattage: 20, devices: [] }).watts).toBe(1000);
  });
});
