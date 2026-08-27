import { describe, expect, it } from "vitest";
import { deriveBenchmark, describeBasis } from "@/lib/circuit-demos";

const demo = (id: string, sequence: number, savingsPct: number, rejected = false) => ({
  id, sequence, savingsPct, rejected,
});

describe("one demo", () => {
  it("decides the benchmark on its own", () => {
    const b = deriveBenchmark([demo("d1", 1, 66.3998)]);
    expect(b.pct).toBe(66.3998);
    expect(b.basis.kind).toBe("single");
    expect(b.inBand).toBe(true);
  });

  it("and a circuit with no demo has no benchmark", () => {
    const b = deriveBenchmark([]);
    expect(b.pct).toBeNull();
    expect(describeBasis(b.basis)).toMatch(/no demo/i);
  });
});

describe("two demos, both counting", () => {
  it("averages the PERCENTAGES, not the consumption", () => {
    // Aditya Urban Casa: 100 lights at 48.28% and 22 at 85.19%. Their mean is
    // what its signed agreement carries. Weighting by consumption would give
    // 55.97%, which is not the number anyone agreed.
    const b = deriveBenchmark([demo("d1", 1, 48.28), demo("d2", 2, 85.16)]);
    expect(b.pct).toBe(66.72);
    expect(b.raw).toBe(66.72);
    expect(b.basis.kind).toBe("average");
  });

  it("and the mean is unweighted however lopsided the light counts", () => {
    const b = deriveBenchmark([demo("d1", 1, 50), demo("d2", 2, 90)]);
    expect(b.pct).toBe(70);
  });
});

describe("a rejected demo", () => {
  it("takes no part — the survivor decides alone", () => {
    // The first ran badly and a second was done.
    const b = deriveBenchmark([demo("d1", 1, 12.5, true), demo("d2", 2, 64)]);
    expect(b.pct).toBe(64);
    expect(b.basis).toMatchObject({ kind: "single", demoId: "d2" });
  });

  it("but is still on record, so rejecting every demo leaves no benchmark", () => {
    const b = deriveBenchmark([demo("d1", 1, 48, true), demo("d2", 2, 85, true)]);
    expect(b.pct).toBeNull();
    expect(describeBasis(b.basis)).toMatch(/rejected/i);
  });
});

describe("no rounding", () => {
  it("stores what the demos measured, to the last place", () => {
    // The user's call (2026-08-27): a stored benchmark is either measured or
    // deliberately chosen. Rounding would make it a third thing.
    expect(deriveBenchmark([demo("d1", 1, 63.44195043)]).pct).toBe(63.44195043);
    expect(deriveBenchmark([demo("d1", 1, 64.00013280653408)]).pct).toBe(64.00013280653408);
  });

  it("so a near miss stays a near miss", () => {
    const b = deriveBenchmark([demo("d1", 1, 59.996)]);
    expect(b.pct).toBe(59.996);
    expect(b.inBand).toBe(false);
  });

  it("and the band's own edges count as inside it", () => {
    expect(deriveBenchmark([demo("d1", 1, 80)]).inBand).toBe(true);
    expect(deriveBenchmark([demo("d1", 1, 60)]).inBand).toBe(true);
  });
});

describe("an override", () => {
  it("replaces the figure and keeps the measured one visible", () => {
    // Aditya Mega City: its readings give 58.48% raw, its agreement says 64%.
    const b = deriveBenchmark([demo("d1", 1, 58.48)], { pct: 64, reason: "Agreement states 64%" });
    expect(b.pct).toBe(64);
    expect(b.raw).toBe(58.48);
    expect(b.basis).toMatchObject({ kind: "override", overridePct: 64 });
    expect(describeBasis(b.basis)).toMatch(/58\.48/);
  });

  it("does not make an out-of-band circuit read as in band", () => {
    // Overriding is a recorded decision, not a way to close FEAT-015's review.
    const b = deriveBenchmark([demo("d1", 1, 41)], { pct: 64, reason: "..." });
    expect(b.pct).toBe(64);
    expect(b.inBand).toBe(false);
  });

  it("works on a circuit with no demo at all, and says so", () => {
    const b = deriveBenchmark([], { pct: 66.4, reason: "Backfilled from the agreement" });
    expect(b.pct).toBe(66.4);
    expect(b.raw).toBeNull();
    expect(b.inBand).toBe(false);
    expect(describeBasis(b.basis)).toMatch(/no demo figure/i);
  });

  it("is stored exactly as typed — rounding IS the override", () => {
    expect(deriveBenchmark([], { pct: 64, reason: "Agreement states 64%" }).pct).toBe(64);
  });
});

