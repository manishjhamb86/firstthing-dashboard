import { describe, expect, it } from "vitest";
import { circuitDailyFromDemos } from "@/lib/demo-readings-series";

const day = (date: string, kWh: number, phase: "pre" | "post") => ({ date, kWh, phase });

describe("a backfilled circuit's daily series", () => {
  it("is just the demo's own days when there is one demo", () => {
    const s = circuitDailyFromDemos([
      { rejected: false, readings: [day("2025-08-03", 48.84, "pre"), day("2025-10-16", 16.58, "post")] },
    ]);
    expect(s.pre).toEqual([{ date: "2025-08-03", kWh: 48.84 }]);
    expect(s.post).toEqual([{ date: "2025-10-16", kWh: 16.58 }]);
  });

  it("adds the demos together on a date, rather than pooling them", () => {
    // Urban Casa's shape: 100 lights and 22 lights, measured the same days.
    // Pooled, 15 Dec would average (46.82 + 12.35) / 2 = 29.6 — a figure
    // describing neither set of lights.
    const s = circuitDailyFromDemos([
      { rejected: false, readings: [day("2025-12-15", 46.82, "pre"), day("2025-12-16", 48.09, "pre")] },
      { rejected: false, readings: [day("2025-12-15", 12.35, "pre"), day("2025-12-16", 12.72, "pre")] },
    ]);
    expect(s.pre).toEqual([
      { date: "2025-12-15", kWh: 46.82 + 12.35 },
      { date: "2025-12-16", kWh: 48.09 + 12.72 },
    ]);
  });

  it("drops a date one demo missed, because it describes part of the circuit", () => {
    const s = circuitDailyFromDemos([
      { rejected: false, readings: [day("2025-12-22", 23.58, "post"), day("2025-12-26", 24.91, "post")] },
      { rejected: false, readings: [day("2025-12-21", 1.83, "post"), day("2025-12-22", 1.66, "post")] },
    ]);
    expect(s.post).toEqual([{ date: "2025-12-22", kWh: 23.58 + 1.66 }]);
  });

  it("ignores a rejected demo entirely", () => {
    const s = circuitDailyFromDemos([
      { rejected: true, readings: [day("2025-12-15", 999, "pre")] },
      { rejected: false, readings: [day("2025-12-15", 46.82, "pre")] },
    ]);
    expect(s.pre).toEqual([{ date: "2025-12-15", kWh: 46.82 }]);
  });

  it("a demo with no days in one phase does not empty that phase for the others", () => {
    const s = circuitDailyFromDemos([
      { rejected: false, readings: [day("2025-12-15", 46.82, "pre"), day("2025-12-22", 23.58, "post")] },
      { rejected: false, readings: [day("2025-12-15", 12.35, "pre")] },
    ]);
    expect(s.pre).toEqual([{ date: "2025-12-15", kWh: 46.82 + 12.35 }]);
    expect(s.post).toEqual([{ date: "2025-12-22", kWh: 23.58 }]);
  });

  it("has nothing to say about a circuit with no demo readings", () => {
    expect(circuitDailyFromDemos([])).toEqual({ pre: [], post: [] });
    expect(circuitDailyFromDemos([{ rejected: false, readings: [] }])).toEqual({ pre: [], post: [] });
  });
});
