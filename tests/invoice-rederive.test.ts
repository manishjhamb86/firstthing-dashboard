import { describe, expect, it } from "vitest";
import { anyLineImprovedToMeasured } from "@/lib/invoice-rederive";

// FEAT-110-AC-5 — the re-derivation trigger. The rule is deliberately
// narrow: agreed → measured fires a new version; anything else (still
// agreed, already measured, or a genuine measured → agreed regression) does
// not, so a reading commit that changes nothing about the published bill
// never spawns a version.

describe("anyLineImprovedToMeasured", () => {
  it("fires when an agreed line becomes measured", () => {
    const old = new Map([["c1", "agreed" as const]]);
    expect(anyLineImprovedToMeasured(old, [{ circuitId: "c1", basis: "measured" }])).toBe(true);
  });

  it("does not fire when the line stays agreed", () => {
    const old = new Map([["c1", "agreed" as const]]);
    expect(anyLineImprovedToMeasured(old, [{ circuitId: "c1", basis: "agreed" }])).toBe(false);
  });

  it("does not fire when the line was already measured", () => {
    const old = new Map([["c1", "measured" as const]]);
    expect(anyLineImprovedToMeasured(old, [{ circuitId: "c1", basis: "measured" }])).toBe(false);
  });

  it("does not fire on a measured → agreed regression — that is not this hook's job", () => {
    const old = new Map([["c1", "measured" as const]]);
    expect(anyLineImprovedToMeasured(old, [{ circuitId: "c1", basis: "agreed" }])).toBe(false);
  });

  it("fires when at least one of several lines flips, even if others do not", () => {
    const old = new Map([
      ["c1", "agreed" as const],
      ["c2", "measured" as const],
      ["c3", "agreed" as const],
    ]);
    const newLines = [
      { circuitId: "c1", basis: "agreed" as const },
      { circuitId: "c2", basis: "measured" as const },
      { circuitId: "c3", basis: "measured" as const },
    ];
    expect(anyLineImprovedToMeasured(old, newLines)).toBe(true);
  });

  it("a circuit with no prior line (new to the month) never fires on its own", () => {
    const old = new Map<string, "agreed" | "measured">();
    expect(anyLineImprovedToMeasured(old, [{ circuitId: "c9", basis: "measured" }])).toBe(false);
  });
});
