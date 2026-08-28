import { describe, expect, it } from "vitest";
import { buildDemoReport, type DemoReportCircuitInput } from "@/lib/demo-report";

function readings(values: number[], startDay = 1) {
  return values.map((v, i) => ({
    date: `2026-09-${String(startDay + i).padStart(2, "0")}`,
    consumptionKwh: v,
  }));
}

function circuit(overrides: Partial<DemoReportCircuitInput> = {}): DemoReportCircuitInput {
  return {
    id: "ckt-1",
    lightType: "basement",
    location: "Block A basement",
    meteredLightCount: 50,
    representedLightCount: 200,
    wattage: 18,
    preInstallBaseline: 100,
    benchmarkSavingsPct: 70,
    state: "benchmark_confirmed",
    preInstallReadings: readings([100, 100, 100, 100, 100]),
    postInstallReadings: readings([30, 30, 30, 30, 30], 10),
    ...overrides,
  };
}

describe("TC-020-1 — buildDemoReport happy path (FEAT-020-AC-1)", () => {
  const result = buildDemoReport({ circuits: [circuit()], societyLightCount: 400 });

  it("produces a report", () => {
    expect(result.ok).toBe(true);
  });

  it("carries both window averages and the measured percentage", () => {
    if (!result.ok) throw new Error("expected ok");
    expect(result.figures.preInstallBaselineTotal).toBe(100);
    expect(result.figures.postInstallAverageTotal).toBe(30);
    expect(result.figures.measuredSavingsPct).toBe(70);
  });

  it("extrapolates per circuit by its own represented count, not a society-wide average (CON-11)", () => {
    if (!result.ok) throw new Error("expected ok");
    // 70 kWh/day saved on 50 metered lights, representing 200 of that type:
    // 70 × (200 / 50) = 280.
    expect(result.figures.circuits[0].extrapolationFactor).toBe(4);
    expect(result.figures.projectedSavingsKwhPerDay).toBe(280);
  });

  it("keeps the daily readings behind both figures (INV-02)", () => {
    if (!result.ok) throw new Error("expected ok");
    expect(result.figures.circuits[0].preInstallReadings).toHaveLength(5);
    expect(result.figures.circuits[0].postInstallReadings).toHaveLength(5);
    expect(result.figures.circuits[0].postInstallReadings[0].date).toBe("2026-09-10");
  });

  it("does not round — the figure feeds a billed rupee amount", () => {
    const odd = buildDemoReport({
      circuits: [circuit({ preInstallBaseline: 1078, postInstallReadings: readings([321, 322, 323], 10) })],
      societyLightCount: 400,
    });
    if (!odd.ok) throw new Error("expected ok");
    expect(odd.figures.postInstallAverageTotal).toBeCloseTo(322, 10);
    expect(odd.figures.measuredSavingsPct).toBeCloseTo(70.12987012987013, 10);
  });
});

describe("TC-020-3 — buildDemoReport names the missing input (FEAT-020-AC-3)", () => {
  it("names a missing lighting inventory rather than failing generically", () => {
    const r = buildDemoReport({ circuits: [circuit()], societyLightCount: 0 });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.blocker).toBe("no-lighting-inventory");
  });

  it("refuses when there are no circuits at all", () => {
    const r = buildDemoReport({ circuits: [], societyLightCount: 400 });
    expect(!r.ok && r.blocker).toBe("no-circuits");
  });

  it("never reports from an out-of-range result — an unconfirmed benchmark has nothing to report", () => {
    const r = buildDemoReport({
      circuits: [circuit({ state: "benchmark_review", benchmarkSavingsPct: null })],
      societyLightCount: 400,
    });
    expect(!r.ok && r.blocker).toBe("no-benchmarked-circuits");
  });

  it("waits for every circuit rather than reporting on a partial demo", () => {
    const r = buildDemoReport({
      circuits: [circuit(), circuit({ id: "ckt-2", state: "post_install_monitoring" })],
      societyLightCount: 400,
    });
    expect(!r.ok && r.blocker).toBe("circuits-still-commissioning");
  });

  it("ignores circuits ruled out of the demo when deciding it is complete", () => {
    const r = buildDemoReport({
      circuits: [circuit(), circuit({ id: "ckt-3", state: "ineligible" })],
      societyLightCount: 400,
    });
    expect(r.ok).toBe(true);
  });
});

describe("TC-020-1b — several circuits, each with its own benchmark (CON-11)", () => {
  it("totals the circuits and extrapolates each by its own factor", () => {
    const r = buildDemoReport({
      circuits: [
        circuit(),
        circuit({
          id: "ckt-2",
          lightType: "staircase",
          meteredLightCount: 20,
          representedLightCount: 100,
          preInstallBaseline: 40,
          benchmarkSavingsPct: 65,
          postInstallReadings: readings([14, 14, 14], 10),
        }),
      ],
      societyLightCount: 400,
    });
    if (!r.ok) throw new Error("expected ok");
    expect(r.figures.preInstallBaselineTotal).toBe(140);
    expect(r.figures.postInstallAverageTotal).toBe(44);
    // 70 × 4 = 280, plus 26 × 5 = 130.
    expect(r.figures.projectedSavingsKwhPerDay).toBe(410);
    // and the per-circuit benchmarks stay distinct, never averaged together
    expect(r.figures.circuits.map((c) => c.benchmarkSavingsPct)).toEqual([70, 65]);
  });
});

describe("the report reads whichever store a circuit actually used", () => {
  // A circuit commissioned through CON-45 has no CommissioningReading rows
  // at all — its days are MeterReading rows. Reading only the legacy store
  // reported "a benchmarked circuit has no post-install readings to average"
  // for every such circuit, so the report could never generate and the deal
  // spine stopped at step 4 (user-reported 2026-08-20).
  //
  // The collector is a Server Action, so what is unit-testable here is the
  // rule it applies: a circuit with post-install days builds, one without
  // reports exactly that blocker.

  const circuit = (postInstall: { date: string; consumptionKwh: number }[]) => ({
    id: "c1",
    lightType: "Tube",
    location: "Basement",
    meteredLightCount: 50,
    representedLightCount: 200,
    wattage: 20,
    preInstallBaseline: 70,
    benchmarkSavingsPct: 68,
    state: "benchmark_confirmed",
    preInstallReadings: [{ date: "2026-07-01", consumptionKwh: 70 }],
    postInstallReadings: postInstall,
  });

  it("builds once post-install days are present, whichever store they came from", () => {
    const r = buildDemoReport({
      circuits: [circuit([{ date: "2026-08-01", consumptionKwh: 22.4 }])],
      societyLightCount: 200,
    });
    expect(r.ok).toBe(true);
  });

  it("names the missing-days blocker rather than failing silently", () => {
    const r = buildDemoReport({ circuits: [circuit([])], societyLightCount: 200 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.blocker).toBe("no-post-install-readings");
  });
});

describe("the report agrees with the contract", () => {
  const circuit = (over: Partial<Parameters<typeof buildDemoReport>[0]["circuits"][number]> = {}) => ({
    id: "c1",
    lightType: "basement",
    location: "Basement",
    meteredLightCount: 91,
    representedLightCount: 605,
    wattage: 20,
    preInstallBaseline: 47.4,
    benchmarkSavingsPct: 64,
    state: "benchmark_confirmed" as const,
    preInstallReadings: [{ date: "2025-01-29", consumptionKwh: 47.4 }],
    postInstallReadings: [{ date: "2025-02-13", consumptionKwh: 19.68 }],
    ...over,
  });

  it("reports the benchmark on record, not the ratio of the stored days", () => {
    // Aditya Mega City: the days ratio to 58.48% because the street lights
    // sharing the circuit are still consuming; the agreement says 64%,
    // because they come off both sides. 64% is what the society is billed on.
    const r = buildDemoReport({ circuits: [circuit()], societyLightCount: 605 });
    if (!r.ok) throw new Error(r.blocker);
    expect(r.figures.agreedSavingsPct).toBeCloseTo(64, 10);
    expect(r.figures.measuredSavingsPct).toBeCloseTo(58.4810126582, 6);
  });

  it("extrapolates the agreed saving, so the projection matches the contract", () => {
    const r = buildDemoReport({ circuits: [circuit()], societyLightCount: 605 });
    if (!r.ok) throw new Error(r.blocker);
    // 47.4 × 64% × (605 / 91), and deliberately not (47.4 − 19.68) × the factor.
    expect(r.figures.projectedSavingsKwhPerDay).toBeCloseTo(47.4 * 0.64 * (605 / 91), 10);
    expect(r.figures.projectedSavingsKwhPerDay).not.toBeCloseTo((47.4 - 19.68) * (605 / 91), 2);
  });

  it("weights two circuits by their baselines rather than averaging blind", () => {
    // Urban Casa: 59.92 kWh/day at 66.72% and 1.81 at 78%. A plain mean would
    // give 72.36% and let a circuit a seventieth the size pull the figure up.
    const r = buildDemoReport({
      circuits: [
        circuit({ id: "a", preInstallBaseline: 59.92, benchmarkSavingsPct: 66.72, meteredLightCount: 122, representedLightCount: 736 }),
        circuit({ id: "b", preInstallBaseline: 1.81, benchmarkSavingsPct: 78, meteredLightCount: 16, representedLightCount: 1153 }),
      ],
      societyLightCount: 1889,
    });
    if (!r.ok) throw new Error(r.blocker);
    const expected = ((59.92 * 0.6672 + 1.81 * 0.78) / (59.92 + 1.81)) * 100;
    expect(r.figures.agreedSavingsPct).toBeCloseTo(expected, 10);
    expect(r.figures.agreedSavingsPct).toBeGreaterThan(66.72);
    expect(r.figures.agreedSavingsPct).toBeLessThan(67.1);
  });
});
