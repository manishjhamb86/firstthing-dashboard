import { describe, expect, it } from "vitest";
import { demoLightsInstalled, describeLights, fullFromTotal, refuseFullInstallationCount, totalLights } from "@/lib/light-population";

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
