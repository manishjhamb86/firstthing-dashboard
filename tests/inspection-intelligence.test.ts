import { describe, expect, it } from "vitest";
import { classifyPortfolioFaultRates, currentMonthSummary, type SocietyFaultHistory } from "@/lib/inspection-intelligence";

describe("currentMonthSummary", () => {
  it("buckets done / pending / delayed over the active set", () => {
    const summary = currentMonthSummary({
      activeSocietyIds: ["a", "b", "c", "d"],
      doneThisMonthIds: new Set(["a"]),
      // b missed last month too (delayed); c and d didn't, so they're just mid-month pending.
      missingLastMonthIds: new Set(["b"]),
    });
    expect(summary).toEqual({ totalActive: 4, doneCount: 1, pendingCount: 2, delayedCount: 1 });
  });

  it("an empty active set reads all zeros, not a crash", () => {
    expect(currentMonthSummary({ activeSocietyIds: [], doneThisMonthIds: new Set(), missingLastMonthIds: new Set() })).toEqual({
      totalActive: 0,
      doneCount: 0,
      pendingCount: 0,
      delayedCount: 0,
    });
  });
});

describe("classifyPortfolioFaultRates", () => {
  it("a society with too little history is neither normal nor chronic", () => {
    const histories: SocietyFaultHistory[] = [{ societyId: "s1", name: "One Visit Society", faultRates: [0.05] }];
    const result = classifyPortfolioFaultRates(histories);
    expect(result.notEnoughHistoryCount).toBe(1);
    expect(result.normalCount).toBe(0);
    expect(result.chronicCount).toBe(0);
  });

  it("one bad visit among otherwise-clean ones does not flag a society — a sporadic spike, not a chronic problem", () => {
    const histories: SocietyFaultHistory[] = [
      { societyId: "s1", name: "Mostly Clean", faultRates: [0.01, 0.01, 0.4, 0.01, 0.01] },
      { societyId: "s2", name: "Also Clean", faultRates: [0.01, 0.01, 0.01] },
      { societyId: "s3", name: "Also Clean 2", faultRates: [0.01, 0.01, 0.01] },
    ];
    const result = classifyPortfolioFaultRates(histories);
    expect(result.chronicCount).toBe(0);
    expect(result.normalCount).toBe(3);
  });

  it("a sustained high rate across most recent visits flags as chronic", () => {
    const histories: SocietyFaultHistory[] = [
      { societyId: "s1", name: "Chronic Society", faultRates: [0.3, 0.28, 0.32, 0.29, 0.31, 0.3] },
      { societyId: "s2", name: "Ordinary A", faultRates: [0.02, 0.01, 0.02] },
      { societyId: "s3", name: "Ordinary B", faultRates: [0.015, 0.02, 0.01] },
      { societyId: "s4", name: "Ordinary C", faultRates: [0.01, 0.02, 0.015] },
    ];
    const result = classifyPortfolioFaultRates(histories);
    expect(result.chronicCount).toBe(1);
    expect(result.chronic[0].societyId).toBe("s1");
    expect(result.normalCount).toBe(3);
  });

  it("a near-zero portfolio median does not let ordinary noise read as chronic — the absolute floor", () => {
    // Every society reads almost perfectly clean; one is twice the (tiny) median but still well under the 3% floor.
    const histories: SocietyFaultHistory[] = [
      { societyId: "s1", name: "A", faultRates: [0.002, 0.002, 0.002] },
      { societyId: "s2", name: "B", faultRates: [0.001, 0.001, 0.001] },
      { societyId: "s3", name: "C", faultRates: [0.001, 0.001, 0.001] },
    ];
    const result = classifyPortfolioFaultRates(histories);
    expect(result.chronicCount).toBe(0);
  });

  it("only the trailing window counts — an old bad run that has since recovered reads normal", () => {
    const histories: SocietyFaultHistory[] = [
      // 6 recent clean visits after an old (now out of window) bad run.
      { societyId: "s1", name: "Recovered", faultRates: [0.4, 0.4, 0.4, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01] },
      { societyId: "s2", name: "Ordinary", faultRates: [0.01, 0.01, 0.01] },
    ];
    const result = classifyPortfolioFaultRates(histories);
    expect(result.chronicCount).toBe(0);
  });

  it("ranks the chronic list worst-first", () => {
    // Enough clean societies that the portfolio median is set by the typical
    // cohort, not dragged around by the two bad ones themselves.
    const histories: SocietyFaultHistory[] = [
      { societyId: "worse", name: "Worse", faultRates: [0.5, 0.5, 0.5] },
      { societyId: "bad", name: "Bad", faultRates: [0.2, 0.2, 0.2] },
      { societyId: "clean1", name: "Clean 1", faultRates: [0.01, 0.01, 0.01] },
      { societyId: "clean2", name: "Clean 2", faultRates: [0.01, 0.01, 0.01] },
      { societyId: "clean3", name: "Clean 3", faultRates: [0.01, 0.01, 0.01] },
    ];
    const result = classifyPortfolioFaultRates(histories);
    expect(result.chronic.map((c) => c.societyId)).toEqual(["worse", "bad"]);
    expect(result.normalCount).toBe(3);
  });
});
