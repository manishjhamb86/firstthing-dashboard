import { describe, expect, it } from "vitest";
import {
  defaultPreInstallBasis,
  deriveWorksheet,
  refuseWorksheet,
  unitRateForSavedValue,
  type WorksheetCircuitInput,
} from "@/lib/offer-worksheet";

// The screenshot's own deal: 18 metered lift-lobby lights standing in for
// 1,773, benchmark 77.12%, ₹7.24/kWh, ₹33,764.82 a month to FirsThing.
const liftLobby: WorksheetCircuitInput = {
  circuitId: "c1",
  lightType: "Lift Lobby and Staircase",
  location: "Tower A B C D",
  meteredLightCount: 18,
  preInstallBaseline: 2.7, // kWh/day for the 18
  demoBenchmarkSavingsPct: 77.12,
  agreedLightCount: 1773,
  agreedBenchmarkSavingsPct: 77.12,
  preInstallBasis: "demo",
  wattagePerLight: 20,
  hoursPerDay: 24,
};
const bounds = { benchmarkMinPct: 60, benchmarkMaxPct: 80 };

describe("deriveWorksheet — the figures fall out of lights, baseline, % and fee", () => {
  it("extrapolates the pre-install consumption per light, never as a society average", () => {
    const ws = deriveWorksheet({ circuits: [liftLobby], unitElectricityRate: 7.24, monthlyFee: 33764.82 });
    const row = ws.circuits[0];
    expect(row.preInstallKwhPerDay).toBeCloseTo((2.7 / 18) * 1773, 6); // 265.95
    expect(row.savedKwhPerDay).toBeCloseTo(265.95 * 0.7712, 6);
    expect(ws.totals.preInstallKwhPerMonth).toBeCloseTo(265.95 * 30, 6);
    expect(ws.totals.savedKwhPerMonth).toBeCloseTo(265.95 * 0.7712 * 30, 6);
  });

  it("derives the share from the fee, with the party named", () => {
    const ws = deriveWorksheet({ circuits: [liftLobby], unitElectricityRate: 7.24, monthlyFee: 33764.82 });
    const saved = 265.95 * 0.7712 * 30 * 7.24; // ₹44,553.48…
    expect(ws.totals.savedValuePerMonth).toBeCloseTo(saved, 4);
    expect(ws.totals.societyKeepsPerMonth).toBeCloseTo(saved - 33764.82, 4);
    expect(ws.totals.firsthingSharePct).toBeCloseTo((33764.82 / saved) * 100, 6);
    expect(ws.totals.societySharePct).toBeCloseTo(100 - (33764.82 / saved) * 100, 6);
    // FirsThing's share is the FEE's share — the inversion this project has shipped twice.
    expect(ws.totals.firsthingSharePct!).toBeGreaterThan(50);
  });

  it("marks a negotiated benchmark, and a demo-less one, as departing from the demo", () => {
    const same = deriveWorksheet({ circuits: [liftLobby], unitElectricityRate: 7, monthlyFee: 1 });
    expect(same.circuits[0].benchmarkNegotiated).toBe(false);
    const changed = deriveWorksheet({
      circuits: [{ ...liftLobby, agreedBenchmarkSavingsPct: 70 }],
      unitElectricityRate: 7,
      monthlyFee: 1,
    });
    expect(changed.circuits[0].benchmarkNegotiated).toBe(true);
    expect(changed.circuits[0].savedKwhPerDay).toBeCloseTo(265.95 * 0.7, 6);
  });

  it("weights the overall savings % by consumption across circuits", () => {
    const big = { ...liftLobby, circuitId: "big", agreedLightCount: 1000, agreedBenchmarkSavingsPct: 60 };
    const small = { ...liftLobby, circuitId: "small", agreedLightCount: 100, agreedBenchmarkSavingsPct: 80 };
    const ws = deriveWorksheet({ circuits: [big, small], unitElectricityRate: 7, monthlyFee: 1 });
    // 1000 lights at 60% and 100 at 80% → (600 + 80) / 1100 = 61.82%, not 70%.
    expect(ws.totals.savingsPct).toBeCloseTo(61.818181, 4);
    expect(ws.totals.agreedLightCount).toBe(1100);
  });

  it("offers three bases — demo, theoretical, custom — and prices on the chosen one", () => {
    const demo = deriveWorksheet({ circuits: [liftLobby], unitElectricityRate: 7, monthlyFee: 1 }).circuits[0];
    expect(demo.demoKwhPerDay).toBeCloseTo(265.95, 6);
    // 1773 × 20 W × 24 h ÷ 1000 = 851.04 kWh/day
    expect(demo.theoreticalKwhPerDay).toBeCloseTo(851.04, 6);
    expect(demo.preInstallKwhPerDay).toBeCloseTo(265.95, 6);
    const theo = deriveWorksheet({ circuits: [{ ...liftLobby, preInstallBasis: "theoretical" }], unitElectricityRate: 7, monthlyFee: 1 }).circuits[0];
    expect(theo.preInstallKwhPerDay).toBeCloseTo(851.04, 6);
    const custom = deriveWorksheet({
      circuits: [{ ...liftLobby, preInstallBasis: "custom", preInstallKwhPerDayOverride: 300 }],
      unitElectricityRate: 7,
      monthlyFee: 1,
    }).circuits[0];
    expect(custom.preInstallKwhPerDay).toBe(300);
    expect(custom.notDerivable).toBe(false);
  });

  it("defaults to the HIGHER of demo and theoretical — the user's rule", () => {
    expect(defaultPreInstallBasis(liftLobby)).toBe("theoretical"); // 851 > 266
    expect(defaultPreInstallBasis({ ...liftLobby, wattagePerLight: 2 })).toBe("demo"); // 85 < 266
    expect(defaultPreInstallBasis({ ...liftLobby, preInstallBaseline: null })).toBe("theoretical");
    expect(defaultPreInstallBasis({ ...liftLobby, preInstallBaseline: null, wattagePerLight: null })).toBe("custom");
  });

  it("flags a row whose chosen basis has nothing behind it", () => {
    const none = deriveWorksheet({
      circuits: [{ ...liftLobby, preInstallBasis: "demo", preInstallBaseline: null, demoBenchmarkSavingsPct: null }],
      unitElectricityRate: 7,
      monthlyFee: 1,
    });
    expect(none.circuits[0].notDerivable).toBe(true);
    expect(refuseWorksheet(none, bounds)).toBe("not-derivable");
    const blankCustom = deriveWorksheet({
      circuits: [{ ...liftLobby, preInstallBasis: "custom" }],
      unitElectricityRate: 7,
      monthlyFee: 1,
    });
    expect(refuseWorksheet(blankCustom, bounds)).toBe("not-derivable");
  });
});

describe("unitRateForSavedValue — the other direction of the same identity", () => {
  it("round-trips: value ÷ kWh gives back the rate that produced the value", () => {
    const ws = deriveWorksheet({ circuits: [liftLobby], unitElectricityRate: 7.24, monthlyFee: 1 });
    expect(unitRateForSavedValue(ws.totals.savedKwhPerMonth, ws.totals.savedValuePerMonth)).toBeCloseTo(7.24, 10);
  });
  it("is null when nothing is saved — a rate cannot be inferred from zero kWh", () => {
    expect(unitRateForSavedValue(0, 5000)).toBeNull();
  });
});

describe("refuseWorksheet", () => {
  const ok = () => deriveWorksheet({ circuits: [liftLobby], unitElectricityRate: 7.24, monthlyFee: 33764.82 });
  it("passes the screenshot's deal", () => expect(refuseWorksheet(ok(), bounds)).toBeNull());
  it("refuses no circuits", () =>
    expect(refuseWorksheet(deriveWorksheet({ circuits: [], unitElectricityRate: 7, monthlyFee: 1 }), bounds)).toBe("no-circuits"));
  it("refuses a zero or fractional light count", () => {
    expect(refuseWorksheet(deriveWorksheet({ circuits: [{ ...liftLobby, agreedLightCount: 0 }], unitElectricityRate: 7, monthlyFee: 1 }), bounds)).toBe("invalid-light-count");
    expect(refuseWorksheet(deriveWorksheet({ circuits: [{ ...liftLobby, agreedLightCount: 12.5 }], unitElectricityRate: 7, monthlyFee: 1 }), bounds)).toBe("invalid-light-count");
  });
  it("refuses a benchmark outside CON-20's band", () => {
    expect(refuseWorksheet(deriveWorksheet({ circuits: [{ ...liftLobby, agreedBenchmarkSavingsPct: 85 }], unitElectricityRate: 7, monthlyFee: 1 }), bounds)).toBe("invalid-benchmark");
    expect(refuseWorksheet(deriveWorksheet({ circuits: [{ ...liftLobby, agreedBenchmarkSavingsPct: 59.9 }], unitElectricityRate: 7, monthlyFee: 1 }), bounds)).toBe("invalid-benchmark");
  });
  it("refuses a missing rate or fee, and a fee that swallows the whole saving", () => {
    expect(refuseWorksheet(deriveWorksheet({ circuits: [liftLobby], unitElectricityRate: 0, monthlyFee: 1 }), bounds)).toBe("invalid-unit-rate");
    expect(refuseWorksheet(deriveWorksheet({ circuits: [liftLobby], unitElectricityRate: 7, monthlyFee: 0 }), bounds)).toBe("invalid-fee");
    expect(refuseWorksheet(deriveWorksheet({ circuits: [liftLobby], unitElectricityRate: 7.24, monthlyFee: 99_999 }), bounds)).toBe("fee-exceeds-saving");
  });
});
