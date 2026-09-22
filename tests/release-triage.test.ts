import { describe, expect, it } from "vitest";
import { triageInvoiceMonth, type TriageInput } from "@/lib/release-triage";

describe("triageInvoiceMonth", () => {
  const routine: TriageInput = {
    societyConfirmed: true,
    monthConfirmed: true,
    allLinesMapped: true,
    arithmeticOk: true,
    paidStatusChosen: true,
    invoiceTotal: 100_000,
    trailingInvoicedMean: 100_000,
    basisRegressedCircuits: [],
  };

  it("calls a clean month routine", () => {
    expect(triageInvoiceMonth(routine)).toEqual({ routine: true, reasons: [] });
  });

  it("needs review on any of the belt-and-braces checks, though submit should already have caught them", () => {
    expect(triageInvoiceMonth({ ...routine, societyConfirmed: false }).routine).toBe(false);
    expect(triageInvoiceMonth({ ...routine, monthConfirmed: false }).routine).toBe(false);
    expect(triageInvoiceMonth({ ...routine, allLinesMapped: false }).reasons).toContain(
      "A service line is not mapped to a circuit",
    );
    expect(triageInvoiceMonth({ ...routine, arithmeticOk: false }).routine).toBe(false);
    expect(triageInvoiceMonth({ ...routine, paidStatusChosen: false }).routine).toBe(false);
  });

  it("needs review when the total moves more than 10% from the trailing mean", () => {
    expect(triageInvoiceMonth({ ...routine, invoiceTotal: 110_001 }).reasons[0]).toMatch(/above the 3-month average/);
    expect(triageInvoiceMonth({ ...routine, invoiceTotal: 89_999 }).reasons[0]).toMatch(/below the 3-month average/);
  });

  it("accepts a total exactly 10% away — the rule is 'more than'", () => {
    expect(triageInvoiceMonth({ ...routine, invoiceTotal: 110_000 }).routine).toBe(true);
    expect(triageInvoiceMonth({ ...routine, invoiceTotal: 90_000 }).routine).toBe(true);
  });

  it("states the variance in the accountant's language, with a real number", () => {
    expect(triageInvoiceMonth({ ...routine, invoiceTotal: 134_000 }).reasons).toContain(
      "Total is 34% above the 3-month average",
    );
  });

  it("does not judge variance for a society with no billing history yet", () => {
    expect(triageInvoiceMonth({ ...routine, trailingInvoicedMean: null, invoiceTotal: 999_999 }).routine).toBe(true);
  });

  it("needs review when a circuit's basis regressed from measured to agreed", () => {
    const t = triageInvoiceMonth({ ...routine, basisRegressedCircuits: ["c1"] });
    expect(t.routine).toBe(false);
    expect(t.reasons[0]).toMatch(/moved from measured savings back to the agreed benchmark/);
  });

  it("an agreed-to-measured improvement is never a flag on its own", () => {
    // basisRegressedCircuits only ever names a measured -> agreed move —
    // an improvement produces no entry at all, so passing an empty array
    // (as the loader would for an improved-only month) stays routine.
    expect(triageInvoiceMonth(routine).routine).toBe(true);
  });

  it("reports every failing condition, not just the first", () => {
    const t = triageInvoiceMonth({ ...routine, allLinesMapped: false, paidStatusChosen: false, invoiceTotal: 200_000 });
    expect(t.reasons).toHaveLength(3);
  });
});
