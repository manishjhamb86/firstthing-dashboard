import { describe, expect, it } from "vitest";
import {
  ASSUMED_GST_RATE,
  reconcileInvoiceAmount,
  refuseInvoiceAttach,
  refuseRelease,
} from "@/lib/invoice-reconciliation";

// FEAT-053/CON-33 — the real sample invoice this was built against
// (FT/2026-27/055): Sub Total 14,050.00, IGST18 2,529.00, Total 16,579.00 —
// exactly computedTotal * 1.18, to the rupee.

describe("reconcileInvoiceAmount", () => {
  it("matches the real sample invoice's own arithmetic exactly", () => {
    const r = reconcileInvoiceAmount(14050, 16579);
    expect(r.expectedAmount).toBeCloseTo(16579, 2);
    expect(r.status).toBe("matched");
  });

  it("is within tolerance for ordinary rounding", () => {
    const r = reconcileInvoiceAmount(14050, 16580); // 1 rupee off on the GST line
    expect(r.status).toBe("matched");
  });

  it("flags a genuinely different amount as mismatched", () => {
    const r = reconcileInvoiceAmount(14050, 12000);
    expect(r.status).toBe("mismatched");
    expect(r.deltaPct).toBeGreaterThan(2);
  });

  it("does NOT compare the raw pre-tax total against the invoiced total", () => {
    // If this compared 14,050 to 16,579 directly it would read as a huge
    // mismatch (18% off) even though the invoice is exactly right.
    const naiveDeltaPct = (Math.abs(16579 - 14050) / 14050) * 100;
    expect(naiveDeltaPct).toBeGreaterThan(15);
    expect(reconcileInvoiceAmount(14050, 16579).status).toBe("matched");
  });

  it("uses the stated 18% assumption, not a hardcoded expected value", () => {
    const r = reconcileInvoiceAmount(1000, 1180);
    expect(r.expectedAmount).toBe(1000 * (1 + ASSUMED_GST_RATE));
  });
});

describe("refuseRelease", () => {
  const released = { calculation: { status: "released" as const }, invoice: null, unresolvedDeviationCount: 0 };
  const okBase = {
    calculation: { status: "calculated" as const },
    invoice: { reconciliationStatus: "matched" as const },
    unresolvedDeviationCount: 0,
  };

  it("refuses an already-released month", () => {
    expect(refuseRelease(released)).toMatch(/already released/i);
  });

  it("refuses a superseded month", () => {
    expect(
      refuseRelease({ ...okBase, calculation: { status: "superseded" } }),
    ).toMatch(/newer version/i);
  });

  it("refuses a held month", () => {
    expect(refuseRelease({ ...okBase, calculation: { status: "held" } })).toMatch(/held/i);
  });

  it("refuses while a deviation is still open", () => {
    expect(refuseRelease({ ...okBase, unresolvedDeviationCount: 2 })).toMatch(/2 deviations.*open/i);
  });

  it("refuses with no invoice attached at all", () => {
    expect(refuseRelease({ ...okBase, invoice: null })).toMatch(/no invoice is attached/i);
  });

  it("refuses an unacknowledged mismatch", () => {
    expect(
      refuseRelease({ ...okBase, invoice: { reconciliationStatus: "mismatched" } }),
    ).toMatch(/doesn't match/i);
  });

  it("allows release once matched, with nothing else outstanding", () => {
    expect(refuseRelease(okBase)).toBeNull();
  });

  it("allows release once a mismatch has been acknowledged", () => {
    expect(refuseRelease({ ...okBase, invoice: { reconciliationStatus: "acknowledged" } })).toBeNull();
  });
});

describe("refuseInvoiceAttach", () => {
  const base = { calculation: { status: "calculated" as const }, alreadyAttached: false, amount: 16579 };

  it("refuses attaching to a released month", () => {
    expect(refuseInvoiceAttach({ ...base, calculation: { status: "released" } })).toMatch(/already released/i);
  });

  it("refuses a second attach — no correction path yet", () => {
    expect(refuseInvoiceAttach({ ...base, alreadyAttached: true })).toMatch(/no correction path/i);
  });

  it("refuses a non-positive amount", () => {
    expect(refuseInvoiceAttach({ ...base, amount: 0 })).toMatch(/positive number/i);
    expect(refuseInvoiceAttach({ ...base, amount: -5 })).toMatch(/positive number/i);
    expect(refuseInvoiceAttach({ ...base, amount: NaN })).toMatch(/positive number/i);
  });

  it("allows a first attach to a calculated month", () => {
    expect(refuseInvoiceAttach(base)).toBeNull();
  });
});
