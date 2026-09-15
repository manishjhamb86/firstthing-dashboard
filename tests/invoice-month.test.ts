import { describe, expect, it } from "vitest";
import {
  checkLineArithmetic,
  checkTotalsArithmetic,
  deriveInvoiceMonth,
  type InvoiceMonthPart,
} from "@/lib/invoice-month";

// Aditya Mega City, July 2026 — the real FT/2026-27/055: 605 lights at
// ₹23.23, discount 4.15, line ₹14,050.00. The circuit's own rows: baseline
// 47.4 kWh/day over 91 metered lights, benchmark 64% (override), ₹7/kWh,
// and the agreement's split: 64% society / 36% FirsThing.
const AMC: InvoiceMonthPart = {
  contractId: "ct-amc",
  unitElectricityRate: 7,
  societyRevenueSharePct: 64,
  tolerancePct: 10,
  circuits: [
    {
      circuitId: "ckt-amc-basement",
      lightType: "basement",
      meteredLightCount: 91,
      representedLightCount: 605,
      baselineKwhPerDay: 47.4,
      benchmarkSavingsPct: 64,
      benchmarkSource: "override",
    },
  ],
};
const AMC_LINE = { lineNo: 1, circuitId: "ckt-amc-basement", lightsBilled: 605, amount: 14_050 };

describe("TC-110-1 — agreed-basis derivation: the fee is FirsThing's share of the saving", () => {
  const month = deriveInvoiceMonth({ period: "2026-07", parts: [AMC], lines: [AMC_LINE], readingsByCircuit: {} });
  const line = month.lines[0];

  it("derives on the agreed basis when the month has no readings", () => {
    expect(month.notDerivable).toEqual([]);
    expect(line.basis).toBe("agreed");
    expect(line.provenance.agreedMethod).toBe("fee_over_share");
    expect(line.savingsPct).toBe(64);
    expect(line.coverageDays).toBe(0);
    expect(line.provenance.fallbackReason).toBe("No readings for this month.");
    expect(line.provenance.benchmarkSource).toBe("override");
  });

  it("saved ₹ is the fee divided by FirsThing's 36% — the user's own rule, to ten places", () => {
    // Computed here from the rule, not copied from the module.
    const saved = 14_050 / 0.36; // 39,027.777…
    expect(line.firsthingSharePct).toBe(36);
    expect(line.savedValue).toBeCloseTo(saved, 10);
    expect(line.savedKwh).toBeCloseTo(saved / 7, 10);
    expect(Math.round(line.savedValue * 100) / 100).toBe(39_027.78);
  });

  it("tells the society the three figures: saved, paid to FirsThing, kept", () => {
    expect(line.amount).toBe(14_050);
    expect(line.societyNet).toBeCloseTo(14_050 / 0.36 - 14_050, 10);
    expect(Math.round(line.societyNet * 100) / 100).toBe(24_977.78);
    expect(month.totals.amount).toBe(14_050);
    expect(month.totals.societyNet).toBeCloseTo(line.societyNet, 10);
    // The saving and the fee are different figures with different owners —
    // the inversion guard this project has needed twice.
    expect(line.savedValue).not.toBeCloseTo(line.amount, 0);
  });

  it("records no count disagreement when the invoice matches the circuit", () => {
    expect(line.countDisagreement).toBeNull();
  });

  it("falls back to baseline arithmetic on a lump-sum deal, which has no share to divide by", () => {
    const lump = deriveInvoiceMonth({ period: "2026-07", parts: [{ ...AMC, societyRevenueSharePct: null }], lines: [AMC_LINE], readingsByCircuit: {} });
    const l = lump.lines[0];
    expect(l.provenance.agreedMethod).toBe("baseline_arithmetic");
    const baseline = (47.4 / 91) * 605 * 31;
    expect(l.savedKwh).toBeCloseTo(baseline * 0.64, 10);
    expect(l.savedValue).toBeCloseTo(baseline * 0.64 * 7, 10);
    expect(l.firsthingSharePct).toBeNull();
  });
});

describe("measured basis (FEAT-110-AC-2 / AC-3 / AC-7)", () => {
  const readings = {
    meteredKwh: 3_010, // 28 days on the 91-light metered circuit
    coverageDays: 28,
    readingIds: ["r1", "r2"],
    rawFileIds: ["f1"],
  };

  it("uses the measured % when readings cover the floor, and the fee still equals the line", () => {
    const month = deriveInvoiceMonth({
      period: "2026-07",
      parts: [AMC],
      lines: [AMC_LINE],
      readingsByCircuit: { "ckt-amc-basement": readings },
    });
    const line = month.lines[0];
    expect(line.basis).toBe("measured");
    const expectedPct = (1 - 3_010 / 28 / 47.4) * 100;
    expect(line.savingsPct).toBeCloseTo(expectedPct, 10);
    expect(line.benchmarkSavingsPct).toBe(64); // the agreed figure stays beside it
    expect(line.coverageDays).toBe(28);
    expect(line.provenance.readingIds).toEqual(["r1", "r2"]);
    expect(line.provenance.rawFileIds).toEqual(["f1"]);
    expect(line.provenance.fallbackReason).toBeNull();
    expect(line.amount).toBe(14_050);
  });

  it("falls back to agreed below the coverage floor and states the coverage", () => {
    const month = deriveInvoiceMonth({
      period: "2026-07",
      parts: [AMC],
      lines: [AMC_LINE],
      readingsByCircuit: { "ckt-amc-basement": { ...readings, coverageDays: 9, meteredKwh: 960 } },
    });
    const line = month.lines[0];
    expect(line.basis).toBe("agreed");
    expect(line.savingsPct).toBe(64);
    expect(line.coverageDays).toBe(0);
    expect(line.provenance.fallbackReason).toBe("Readings cover 9 of 31 days — below the 20-day floor.");
    expect(line.provenance.readingIds).toEqual([]);
  });

  it("reports a measured line below the band and nothing more", () => {
    // 47.4 × 28 = 1,327.2 kWh baseline; 800 kWh used → 39.7% saved, short of 64 − 10.
    const month = deriveInvoiceMonth({
      period: "2026-07",
      parts: [AMC],
      lines: [AMC_LINE],
      readingsByCircuit: { "ckt-amc-basement": { ...readings, meteredKwh: 800 } },
    });
    const line = month.lines[0];
    expect(line.basis).toBe("measured");
    expect(line.belowBand).toBe(true);
    expect(line.amount).toBe(14_050); // the bill does not move
  });

  it("a dead meter is not a 97% saving — above the suspect bound it falls back to agreed and says why", () => {
    // 29 zero days in a real July export: 47 kWh over 31 days against 47.4/day.
    const month = deriveInvoiceMonth({
      period: "2026-07",
      parts: [AMC],
      lines: [AMC_LINE],
      readingsByCircuit: { "ckt-amc-basement": { ...readings, coverageDays: 31, meteredKwh: 47 } },
    });
    const line = month.lines[0];
    expect(line.basis).toBe("agreed");
    expect(line.provenance.fallbackReason).toMatch(/96\.8% saving — above the 80% bound/);
    expect(line.provenance.fallbackReason).toMatch(/Check the meter/);
    expect(Math.round(line.savedValue * 100) / 100).toBe(39_027.78);
  });

  it("belowBand is null on an agreed line — there is nothing measured to be below", () => {
    const month = deriveInvoiceMonth({ period: "2026-07", parts: [AMC], lines: [AMC_LINE], readingsByCircuit: {} });
    expect(month.lines[0].belowBand).toBeNull();
  });
});

describe("multi-line months and the count disagreement (FEAT-110-AC-8, FEAT-109-AC-6)", () => {
  // Aditya Urban Casa, August 2026: two deals, two lines, one count disagreement.
  const basement: InvoiceMonthPart = {
    contractId: "ct-auc-basement",
    unitElectricityRate: 7,
    societyRevenueSharePct: 54,
    tolerancePct: 5,
    circuits: [
      { circuitId: "ckt-b", lightType: "basement", meteredLightCount: 122, representedLightCount: 736, baselineKwhPerDay: 59.92, benchmarkSavingsPct: 66.72, benchmarkSource: "demo" },
    ],
  };
  const lobby: InvoiceMonthPart = {
    contractId: "ct-auc-lobby",
    unitElectricityRate: 7,
    societyRevenueSharePct: 54,
    tolerancePct: 5,
    circuits: [
      { circuitId: "ckt-l", lightType: "lift-lobby", meteredLightCount: 16, representedLightCount: 1_153, baselineKwhPerDay: 1.81, benchmarkSavingsPct: 78, benchmarkSource: "demo" },
    ],
  };
  const lines = [
    { lineNo: 1, circuitId: "ckt-b", lightsBilled: 736, amount: 23_299 },
    { lineNo: 2, circuitId: "ckt-l", lightsBilled: 1_155, amount: 14_071.36 },
  ];
  const month = deriveInvoiceMonth({ period: "2026-08", parts: [basement, lobby], lines, readingsByCircuit: {} });

  it("derives each line against its own circuit and sums, never averages", () => {
    expect(month.lines).toHaveLength(2);
    const [b, l] = month.lines;
    expect(b.contractId).toBe("ct-auc-basement");
    expect(l.contractId).toBe("ct-auc-lobby");
    // 54% society / 46% FirsThing: each line's saving is its own fee ÷ 46%.
    expect(b.savedValue).toBeCloseTo(23_299 / 0.46, 10);
    expect(l.savedValue).toBeCloseTo(14_071.36 / 0.46, 10);
    expect(month.totals.savedValue).toBeCloseTo(b.savedValue + l.savedValue, 10);
    expect(month.totals.societyNet).toBeCloseTo(month.totals.savedValue - month.totals.amount, 10);
    expect(month.totals.amount).toBeCloseTo(23_299 + 14_071.36, 10);
  });

  it("uses the invoice's count for the stat and records the circuit's differing count beside it", () => {
    const l = month.lines[1];
    expect(l.lightsBilled).toBe(1_155);
    expect(l.countDisagreement).toBe(1_153);
    expect(month.lines[0].countDisagreement).toBeNull();
  });
});

describe("first-month proration (FEAT-110-AC-6, CON-22)", () => {
  it("bills the days actually served in the contract's first month", () => {
    const month = deriveInvoiceMonth({
      period: "2025-09",
      parts: [{ ...AMC, firstMonthSignedAt: new Date("2025-09-14T00:00:00Z") }], // billing starts the 15th
      lines: [{ ...AMC_LINE, amount: 7_493.33 }],
      readingsByCircuit: {},
    });
    const line = month.lines[0];
    expect(line.daysInMonth).toBe(30);
    expect(line.billedDays).toBe(16);
    expect(line.proration?.proratedDays).toBe(16);
    expect(line.baselineConsumptionKwh).toBeCloseTo((47.4 / 91) * 605 * 16, 10);
    // On the agreed basis the saving follows the fee actually charged for those 16 days.
    expect(line.savedValue).toBeCloseTo(7_493.33 / 0.36, 10);
  });
});

describe("not derivable (FEAT-110-AC-9)", () => {
  it("states a line whose circuit has no baseline, and the month still carries the others", () => {
    const parts: InvoiceMonthPart[] = [
      {
        ...AMC,
        circuits: [
          ...AMC.circuits,
          { circuitId: "ckt-new", lightType: "basement", meteredLightCount: 33, representedLightCount: 1_000, baselineKwhPerDay: null, benchmarkSavingsPct: null, benchmarkSource: "none" },
        ],
      },
    ];
    const month = deriveInvoiceMonth({
      period: "2026-07",
      parts,
      lines: [AMC_LINE, { lineNo: 2, circuitId: "ckt-new", lightsBilled: 1_000, amount: 9_000 }],
      readingsByCircuit: {},
    });
    expect(month.lines).toHaveLength(1);
    expect(month.notDerivable).toEqual([{ lineNo: 2, circuitId: "ckt-new", reason: "Not derivable — no commissioned baseline." }]);
    // The excluded line is not in the totals, and the totals say so by omission.
    expect(month.totals.amount).toBe(14_050);
  });

  it("states a line mapped to a circuit outside every part", () => {
    const month = deriveInvoiceMonth({
      period: "2026-07",
      parts: [AMC],
      lines: [{ lineNo: 1, circuitId: "ckt-elsewhere", lightsBilled: 10, amount: 100 }],
      readingsByCircuit: {},
    });
    expect(month.lines).toEqual([]);
    expect(month.notDerivable[0].reason).toMatch(/not on any contract/);
  });
});

describe("FEAT-109-AC-3 — the invoice's own arithmetic", () => {
  it("accepts the real lines, discount column included", () => {
    expect(checkLineArithmetic({ lineNo: 1, qty: 605, rate: 23.23, discount: 4.15, amount: 14_050 })).toEqual({ ok: true });
    expect(checkLineArithmetic({ lineNo: 1, qty: 736, rate: 31.66, discount: 2.76, amount: 23_299 })).toEqual({ ok: true });
    expect(checkLineArithmetic({ lineNo: 2, qty: 1_155, rate: 12.19, discount: 8.09, amount: 14_071.36 })).toEqual({ ok: true });
  });

  it("flags a line whose printed amount does not follow from its own figures, naming both", () => {
    const r = checkLineArithmetic({ lineNo: 2, qty: 1_155, rate: 12.19, discount: 8.09, amount: 14_071 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.expected).toBeCloseTo(14_071.36, 2);
      expect(r.note).toContain("14,071.36");
      expect(r.note).toContain("14,071.00");
    }
  });

  it("reconciles the real totals: lines → sub-total → 18% → total", () => {
    const lines = [
      { lineNo: 1, qty: 736, rate: 31.66, discount: 2.76, amount: 23_299 },
      { lineNo: 2, qty: 1_155, rate: 12.19, discount: 8.09, amount: 14_071.36 },
      { lineNo: 3, qty: 1, rate: 3_000, discount: 0, amount: 3_000 },
    ];
    const r = checkTotalsArithmetic(lines, { subtotal: 40_370.36, taxAmount: 7_266.66, total: 47_637.02, taxPct: 18 });
    expect(r.ok).toBe(true);
  });

  it("flags a sub-total the lines do not add to", () => {
    const r = checkTotalsArithmetic(
      [{ lineNo: 1, qty: 605, rate: 23.23, discount: 4.15, amount: 14_050 }],
      { subtotal: 14_500, taxAmount: 2_610, total: 17_110, taxPct: 18 },
    );
    expect(r.ok).toBe(false);
    expect(r.subtotal.ok).toBe(false);
    expect(r.total.ok).toBe(true);
  });
});
