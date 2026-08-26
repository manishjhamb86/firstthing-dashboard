import { describe, it, expect } from "vitest";
import {
  averageOfAvailable,
  computeSavings,
  reconcileAverage,
  sharedLoadKwhPerDay,
  type DayReading,
} from "@/lib/savings-math";

const day = (date: string, kwh: number | null, availability: DayReading["availability"] = "available"): DayReading => ({
  date,
  kwh,
  availability,
});

// The real Gaur Saundaryam report, Dec 2025 – May 2026. Using it as the
// fixture means "our arithmetic agrees with the document" is asserted rather
// than assumed — and it is what lets the same code say where it does NOT.
const BEFORE = [20.48, 19.76, 20.5, 20.56, 20.54].map((v, i) => day(`2025-12-0${6 + i}`, v));
const MAY = [
  8.49, 8.58, 8.47, 7.88, 7.91, 7.9, 7.78, 7.73, 7.88, 7.99, 7.95, 8.02, 7.95, 8.05,
  7.89, 8.04, 8.19, 8.0, 8.03, 7.89, 7.87, 7.7, 7.95, 7.97, 7.88, 7.92, 8.13, 8.16,
].map((v, i) => day(`2026-05-${String(i + 4).padStart(2, "0")}`, v));

describe("shared load — fixtures the retrofit did not touch", () => {
  it("reproduces the report's own 2.16 kWh/day", () => {
    // "0.09 kW × 24 hours = 2.16 kWh" — five surface lights at 18W.
    expect(sharedLoadKwhPerDay([{ label: "Surface lights", count: 5, watts: 18, hoursPerDay: 24 }])).toBe(2.16);
  });
  it("sums several kinds", () => {
    expect(
      sharedLoadKwhPerDay([
        { label: "a", count: 5, watts: 18, hoursPerDay: 24 },
        { label: "b", count: 2, watts: 50, hoursPerDay: 12 },
      ]),
    ).toBeCloseTo(3.36, 10);
  });
  it("is zero when nothing shares the circuit", () => expect(sharedLoadKwhPerDay([])).toBe(0));
});

describe("averaging only what reported", () => {
  it("reproduces the report's stated before-average", () => {
    expect(averageOfAvailable(BEFORE).average).toBeCloseTo(20.368, 10);
  });

  // The dangerous direction: a dead meter counted as 0 kWh drags the average
  // toward "we saved everything", which is the figure a society is billed on.
  it("skips an unavailable day rather than counting it as zero", () => {
    const withOutage = [...BEFORE, day("2025-12-11", null, "unavailable")];
    const r = averageOfAvailable(withOutage);
    expect(r.average).toBeCloseTo(20.368, 10);
    expect(r.skipped).toBe(1);
  });

  it("skips a partial day too — a real total that is incomplete", () => {
    const withPartial = [...BEFORE, day("2025-12-11", 6.2, "partial")];
    expect(averageOfAvailable(withPartial).average).toBeCloseTo(20.368, 10);
  });

  it("says so when nothing is usable, rather than returning zero", () => {
    expect(averageOfAvailable([day("2026-03-01", null, "unavailable")]).average).toBeNull();
  });
});

describe("checking the document against its own rows", () => {
  it("agrees where the report is right", () => {
    const r = reconcileAverage(20.37, BEFORE);
    expect(r.agrees).toBe(true);
    expect(r.recommend).toBe("stated");
  });

  // The one the report gets wrong: the May table averages 8.0071 while the
  // sentence under it says 8.58 — which is the largest single value in that
  // table. Somebody copied the wrong cell.
  it("catches the May contradiction and prefers the rows", () => {
    const r = reconcileAverage(8.58, MAY);
    expect(r.computed).toBeCloseTo(8.0071, 4);
    expect(r.agrees).toBe(false);
    expect(r.recommend).toBe("computed");
    expect(r.reason).toMatch(/8\.58/);
  });

  it("accepts the table's own 8.01 as rounding, not disagreement", () => {
    expect(reconcileAverage(8.01, MAY).agrees).toBe(true);
  });

  it("computes one when the document states none", () => {
    const r = reconcileAverage(null, MAY);
    expect(r.recommend).toBe("computed");
  });

  it("cannot check a stated figure with no usable rows, and says so", () => {
    const r = reconcileAverage(8.5, [day("2026-03-01", null, "unavailable")]);
    expect(r.recommend).toBe("stated");
    expect(r.reason).toMatch(/cannot be checked/);
  });
});

describe("savings, with the shared load off both sides", () => {
  it("reproduces the report's 66.88% exactly", () => {
    const r = computeSavings({ baselineKwhPerDay: 20.37, afterKwhPerDay: 8.19, sharedLoadKwhPerDay: 2.16 });
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.adjustedBaseline).toBeCloseTo(18.21, 10);
    expect(r.adjustedAfter).toBeCloseTo(6.03, 10);
    expect(r.savingsPct).toBeCloseTo(66.8863, 4);
  });

  // Ignoring the shared load is not a rounding difference — on this circuit
  // it is 59.79% against 66.89%, seven points of a figure the fee is a share
  // of. That gap is the whole reason the deduction is modelled rather than
  // left to whoever is reading the report.
  it("differs materially from the naive figure that ignores the shared load", () => {
    const naive = computeSavings({ baselineKwhPerDay: 20.37, afterKwhPerDay: 8.19 });
    if ("error" in naive) throw new Error("unexpected");
    expect(naive.savingsPct).toBeCloseTo(59.7938, 4);
    const adjusted = computeSavings({ baselineKwhPerDay: 20.37, afterKwhPerDay: 8.19, sharedLoadKwhPerDay: 2.16 });
    if ("error" in adjusted) throw new Error("unexpected");
    expect(adjusted.savingsPct - naive.savingsPct).toBeGreaterThan(7);
  });

  it("does not round the percentage — the error would land in a rupee figure", () => {
    const r = computeSavings({ baselineKwhPerDay: 20.37, afterKwhPerDay: 8.19, sharedLoadKwhPerDay: 2.16 });
    if ("error" in r) throw new Error("unexpected");
    expect(r.savingsPct).not.toBe(66.89);
  });

  it("refuses a shared load at or above the baseline instead of claiming 100%", () => {
    const r = computeSavings({ baselineKwhPerDay: 2.0, afterKwhPerDay: 1.0, sharedLoadKwhPerDay: 2.16 });
    expect("error" in r && r.error).toMatch(/at or above the baseline/);
  });

  it("refuses a negative shared load", () => {
    expect("error" in computeSavings({ baselineKwhPerDay: 10, afterKwhPerDay: 5, sharedLoadKwhPerDay: -1 })).toBe(true);
  });
});

// ── the circuit's own inventory feeds the deduction ─────────────────────
import { excludedDailyKwh, retrofitLightCount, theoreticalDailyKwh } from "@/lib/circuit-load";

describe("a circuit whose inventory includes fixtures nobody is replacing", () => {
  // Gaur Saundaryam as the surveyor would record it: 42 tube lights being
  // retrofitted, 5 surface lights that merely share the circuit.
  const inventory = [
    { count: 42, wattage: 20, hoursPerDay: 24 },
    { count: 5, wattage: 18, hoursPerDay: 24, excludedFromCalculation: true },
  ];

  it("the reading check still sees the whole circuit", () => {
    // The report's own theoretical figure: 22.32 kWh/day.
    expect(theoreticalDailyKwh(inventory)).toBeCloseTo(22.32, 10);
  });

  it("the deduction is only the excluded lines", () => {
    expect(excludedDailyKwh(inventory)).toBeCloseTo(2.16, 10);
  });

  it("and the saving is attributed to the lights actually replaced", () => {
    expect(retrofitLightCount(inventory)).toBe(42);
  });

  it("end to end, it reproduces the report", () => {
    const r = computeSavings({
      baselineKwhPerDay: 20.37,
      afterKwhPerDay: 8.19,
      sharedLoadKwhPerDay: excludedDailyKwh(inventory),
    });
    if ("error" in r) throw new Error(r.error);
    expect(r.savingsPct).toBeCloseTo(66.8863, 4);
  });
});
