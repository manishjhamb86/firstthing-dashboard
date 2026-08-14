import { describe, expect, it } from "vitest";
import {
  ANOMALY_TOLERANCE_PCT,
  blockingFindings,
  detectAnomalies,
  median,
} from "@/lib/reading-anomaly";

const day = (n: number) => new Date(Date.UTC(2026, 6, n)); // July 2026

/** A month of steady days, which is what a lighting circuit should look like. */
function steady(kWh: number, days = 31) {
  return Array.from({ length: days }, (_, i) => ({ date: day(i + 1), kWh }));
}

describe("median", () => {
  it("takes the midpoint of an even-length set", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([])).toBe(0);
  });
});

describe("the tolerance band", () => {
  it("is the user's ±5%, in one place", () => {
    // Not a decorative assertion: this constant is the whole of FEAT-045's
    // sensitivity, and changing it should be a deliberate act that breaks a
    // test rather than a quiet edit.
    expect(ANOMALY_TOLERANCE_PCT).toBe(5);
  });
});

describe("detectAnomalies — FEAT-045-AC-1, a clean upload", () => {
  it("raises nothing on a complete, steady month", () => {
    expect(detectAnomalies(steady(42), "2026-07")).toEqual([]);
  });

  it("tolerates movement inside the band", () => {
    const days = steady(100);
    days[10].kWh = 104; // +4%
    days[11].kWh = 100; // back down, -3.85% day over day
    expect(detectAnomalies(days, "2026-07")).toEqual([]);
  });
});

describe("detectAnomalies — FEAT-045-AC-3, a zero mid-month", () => {
  it("flags it with the specific reason and blocks billing", () => {
    const days = steady(42);
    days[14].kWh = 0;
    const findings = detectAnomalies(days, "2026-07");
    const zero = findings.find((f) => f.kind === "zero_reading");
    expect(zero).toBeDefined();
    expect(zero!.date?.toISOString().slice(0, 10)).toBe("2026-07-15");
    expect(zero!.detail).toContain("0 kWh");
    expect(zero!.blocksBilling).toBe(true);
  });

  it("does not let the zero drag the reference value down", () => {
    // Three dead days would pull a mean below the working days and make the
    // *working* days read as out-of-range. The median over non-zero days is
    // what stops that.
    const days = steady(42);
    days[10].kWh = 0;
    days[11].kWh = 0;
    days[12].kWh = 0;
    const findings = detectAnomalies(days, "2026-07");
    expect(findings.filter((f) => f.kind === "zero_reading")).toHaveLength(3);
    expect(findings.filter((f) => f.kind === "out_of_range")).toHaveLength(0);
  });

  it("does not double-report a zero as a day-over-day jump", () => {
    const days = steady(42);
    days[14].kWh = 0;
    const findings = detectAnomalies(days, "2026-07");
    expect(findings.filter((f) => f.kind === "day_over_day_jump")).toHaveLength(0);
  });
});

describe("detectAnomalies — out of range", () => {
  it("flags a day beyond ±5% of the circuit's typical day", () => {
    const days = steady(100);
    days[20].kWh = 130;
    const findings = detectAnomalies(days, "2026-07");
    const f = findings.find((x) => x.kind === "out_of_range");
    expect(f).toBeDefined();
    expect(f!.observedValue).toBe(130);
    expect(f!.expectedValue).toBe(100);
    expect(f!.deviationPct).toBeCloseTo(30, 10);
  });

  it("stays quiet with too few days to have a typical day at all", () => {
    const days = [
      { date: day(1), kWh: 10 },
      { date: day(2), kWh: 90 },
    ];
    expect(detectAnomalies(days).filter((f) => f.kind === "out_of_range")).toHaveLength(0);
  });
});

describe("detectAnomalies — day-over-day", () => {
  it("compares consecutive calendar days only", () => {
    // A 60% move across a four-day gap is not a day-over-day jump: whatever
    // changed had somewhere to hide, and reporting it as an overnight jump
    // would be a claim the data does not support.
    const days = [
      { date: day(1), kWh: 100 },
      { date: day(5), kWh: 160 },
      { date: day(6), kWh: 161 },
    ];
    const findings = detectAnomalies(days);
    expect(findings.filter((f) => f.kind === "day_over_day_jump")).toHaveLength(0);
  });

  it("flags an overnight move beyond the band", () => {
    const days = steady(100);
    days[9].kWh = 100;
    days[10].kWh = 112;
    const findings = detectAnomalies(days, "2026-07");
    const jump = findings.find((f) => f.kind === "day_over_day_jump");
    expect(jump).toBeDefined();
    expect(jump!.deviationPct).toBeCloseTo(12, 10);
    expect(jump!.date?.toISOString().slice(0, 10)).toBe("2026-07-11");
  });
});

describe("detectAnomalies — missing days", () => {
  it("names them, and is informational rather than blocking", () => {
    // CON-12's coverage floor is the gate that governs missing days. Making
    // this blocking too would mean two gates for one fact.
    const days = steady(42, 31).filter((_, i) => i !== 4 && i !== 5);
    const findings = detectAnomalies(days, "2026-07");
    const missing = findings.find((f) => f.kind === "missing_days");
    expect(missing).toBeDefined();
    expect(missing!.detail).toContain("2 of 31");
    expect(missing!.detail).toContain("5, 6");
    expect(missing!.blocksBilling).toBe(false);
    expect(missing!.date).toBeNull();
  });

  it("reports nothing about missing days when no period is supplied", () => {
    // The commissioning caller has no calendar month, only a rolling window.
    const findings = detectAnomalies(steady(42, 3));
    expect(findings.filter((f) => f.kind === "missing_days")).toHaveLength(0);
  });

  it("ignores days already excluded by an earlier decision", () => {
    const days = steady(42).map((d, i) => (i === 3 ? { ...d, kWh: 0, excluded: true } : d));
    const findings = detectAnomalies(days, "2026-07");
    expect(findings.filter((f) => f.kind === "zero_reading")).toHaveLength(0);
    // The excluded day is a gap in coverage, and is reported as one.
    expect(findings.find((f) => f.kind === "missing_days")?.detail).toContain("1 of 31");
  });
});

describe("blockingFindings", () => {
  it("keeps only what actually holds the month", () => {
    const days = steady(42, 29); // two days missing from July
    days[3].kWh = 0;
    const findings = detectAnomalies(days, "2026-07");
    const blocking = blockingFindings(findings);
    expect(findings.length).toBeGreaterThan(blocking.length);
    expect(blocking.every((f) => f.kind !== "missing_days")).toBe(true);
  });
});
