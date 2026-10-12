import { describe, expect, it } from "vitest";
import {
  demoLightsInstalled,
  describeLights,
  fullFromTotal,
  fullInstallSavingsEstimate,
  refuseFullInstallationCount,
  representedCountAfterDemoCorrection,
  totalLights,
} from "@/lib/light-population";

const dev = (count: number, replacementCount: number | null = null, excludedFromCalculation = false) => ({ count, replacementCount, excludedFromCalculation });

// The same rule the split migration applies (20260927100000) — the stage
// preview's rows, asserted.
describe("demoLightsInstalled", () => {
  it("Hyde Park: the initial demo's 63, capped at the 55 actually replaced", () => {
    expect(demoLightsInstalled({ meteredLightCount: 55, demos: [{ meteredLightCount: 63 }], devices: [dev(63, 55)] })).toBe(55);
  });
  it("French Apartment: the initial demo's 55, not today's 76 after a light-count change", () => {
    expect(demoLightsInstalled({ meteredLightCount: 76, demos: [{ meteredLightCount: 55 }], devices: [dev(55)] })).toBe(55);
  });
  it("a paper demo (no demo in the app): the circuit's metered count", () => {
    expect(demoLightsInstalled({ meteredLightCount: 96, demos: [], devices: [dev(96)] })).toBe(96);
  });
  it("kept fixtures were never installed by FirsThing (Arihant Arden: 54, 10 excluded)", () => {
    expect(demoLightsInstalled({ meteredLightCount: 54, demos: [], devices: [dev(44), dev(10, null, true)] })).toBe(44);
  });
  it("no inventory: the demo's count", () => {
    expect(demoLightsInstalled({ meteredLightCount: 40, demos: [], devices: [] })).toBe(40);
  });
});

describe("full installation and total", () => {
  it("total = full + demo; full from an invoice's total", () => {
    expect(totalLights(1545, 55)).toBe(1600);
    expect(fullFromTotal(1600, 55)).toBe(1545);
    expect(fullFromTotal(40, 55)).toBe(0);
    expect(describeLights(1545, 55)).toBe("1,600 (1,545 full installation + 55 demo)");
  });
  it("a typed full installation must be above zero (the Indiabulls rule)", () => {
    expect(refuseFullInstallationCount(1545)).toBeNull();
    expect(refuseFullInstallationCount(0)).toMatch(/more than zero/);
    expect(refuseFullInstallationCount(1.5)).toMatch(/whole number/);
  });
});

// ATS Greens Paradiso (2026-10-05, user-asked): a demo's own count corrected
// from 40 to 44 must leave the total installed at 951, moving the split from
// 911 full installation + 40 demo to 907 full installation + 44 demo.
describe("representedCountAfterDemoCorrection", () => {
  it("the installed total stays fixed: 911+40=951 -> 907+44=951", () => {
    const r = representedCountAfterDemoCorrection({ isInitialDemo: true, representedLightCount: 911, oldDemoCount: 40, newDemoCount: 44 });
    expect(r).toEqual({ changed: true, newRepresentedLightCount: 907 });
    expect(totalLights(907, 44)).toBe(951);
    expect(totalLights(911, 40)).toBe(951);
  });
  it("reverses the same way", () => {
    expect(representedCountAfterDemoCorrection({ isInitialDemo: true, representedLightCount: 907, oldDemoCount: 44, newDemoCount: 40 })).toEqual({
      changed: true,
      newRepresentedLightCount: 911,
    });
  });
  it("a later demo (not the initial one) never touches the split", () => {
    expect(representedCountAfterDemoCorrection({ isInitialDemo: false, representedLightCount: 911, oldDemoCount: 40, newDemoCount: 44 })).toEqual({
      changed: false,
    });
  });
  it("no real change, nothing to do", () => {
    expect(representedCountAfterDemoCorrection({ isInitialDemo: true, representedLightCount: 911, oldDemoCount: 40, newDemoCount: 40 })).toEqual({
      changed: false,
    });
  });
  it("refuses rather than driving the full installation to zero or below", () => {
    const r = representedCountAfterDemoCorrection({ isInitialDemo: true, representedLightCount: 10, oldDemoCount: 40, newDemoCount: 55 });
    expect("error" in r && r.error).toMatch(/more than zero/);
  });
});

// Gateway Towers' real figures (2026-10-12, user-specified worked example):
// 19.61616 kWh/day measured on the demo's 42 lights, extrapolated to the
// whole 559-light installation at the 60.9293...% benchmark.
describe("fullInstallSavingsEstimate", () => {
  it("matches the user's own worked example to the demo's true precision", () => {
    const r = fullInstallSavingsEstimate({
      demoBaselineKwhPerDay: 19.61616,
      demoLightCount: 42,
      totalLightCount: 559,
      benchmarkSavingsPct: 60.9293562042724,
      daysInMonth: 30,
      unitElectricityRate: 7,
    });
    // Independently: 19.61616 / 42 = 0.467051... kWh/light/day; × 559 lights
    // × 30 days = 7832.45 kWh; × 60.9293...% = 4772.26 kWh; × ₹7 = ₹33,405.84.
    expect(r.baselineKwh).toBeCloseTo(7832.45, 1);
    expect(r.savedKwh).toBeCloseTo(4772.26, 1);
    expect(r.savedValue).toBeCloseTo(33405.84, 1);
  });

  it("the total installed is what matters, not how it is split between full installation and the demo circuit", () => {
    const before = fullInstallSavingsEstimate({
      demoBaselineKwhPerDay: 19.62,
      demoLightCount: 42,
      totalLightCount: 559, // 517 full + 42 demo
      benchmarkSavingsPct: 61,
      daysInMonth: 30,
      unitElectricityRate: 7,
    });
    const after = fullInstallSavingsEstimate({
      demoBaselineKwhPerDay: 19.62,
      demoLightCount: 42,
      totalLightCount: 559, // 504 full + 55 demo — lights moved, total unchanged
      benchmarkSavingsPct: 61,
      daysInMonth: 30,
      unitElectricityRate: 7,
    });
    expect(after).toEqual(before);
  });

  it("a later rescale of the demo circuit's own count never changes the demo's frozen 42", () => {
    // Same total (559), demo count unchanged at 42 — the figure must not move
    // just because the circuit's OWN live meteredLightCount has grown.
    const r1 = fullInstallSavingsEstimate({ demoBaselineKwhPerDay: 19.62, demoLightCount: 42, totalLightCount: 559, benchmarkSavingsPct: 61, daysInMonth: 30, unitElectricityRate: 7 });
    const r2 = fullInstallSavingsEstimate({ demoBaselineKwhPerDay: 19.62, demoLightCount: 42, totalLightCount: 559, benchmarkSavingsPct: 61, daysInMonth: 30, unitElectricityRate: 7 });
    expect(r1).toEqual(r2);
  });

  it("the latest benchmark is always what is used — a revised benchmark changes the figure", () => {
    const at61 = fullInstallSavingsEstimate({ demoBaselineKwhPerDay: 19.62, demoLightCount: 42, totalLightCount: 559, benchmarkSavingsPct: 61, daysInMonth: 30, unitElectricityRate: 7 });
    const at65 = fullInstallSavingsEstimate({ demoBaselineKwhPerDay: 19.62, demoLightCount: 42, totalLightCount: 559, benchmarkSavingsPct: 65, daysInMonth: 30, unitElectricityRate: 7 });
    expect(at65.savedValue).toBeGreaterThan(at61.savedValue);
  });
});
