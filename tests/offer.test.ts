import { describe, expect, it } from "vitest";
import { projectedMonthlyFee, refuseOffer, type OfferTerms } from "@/lib/offer";
import { checkOfferResponse } from "@/lib/offer-authority";

const terms: OfferTerms = {
  tolerancePct: 5,
  revenueSharePct: 58,
  unitElectricityRate: 8,
  termMonths: 60,
  spareStockCount: 10,
};

describe("TC-027-3 — refuseOffer (FEAT-027-AC-3)", () => {
  const ok = {
    benchmarkSource: "measured" as const,
    demoReportId: "demo-1",
    negotiatedBenchmarkPct: null,
    terms,
  };

  it("allows a complete measured offer", () => {
    expect(refuseOffer(ok)).toBeNull();
  });

  it("refuses a measured offer with no demo report to price it from", () => {
    expect(refuseOffer({ ...ok, demoReportId: null })).toBe("no-demo-report");
  });

  it("refuses a tolerance band CON-01a doesn't allow", () => {
    expect(refuseOffer({ ...ok, terms: { ...terms, tolerancePct: 7 } })).toBe("invalid-tolerance");
    expect(refuseOffer({ ...ok, terms: { ...terms, tolerancePct: 10 } })).toBeNull();
  });

  it("refuses a missing or nonsensical revenue share", () => {
    expect(refuseOffer({ ...ok, terms: { ...terms, revenueSharePct: 0 } })).toBe("invalid-revenue-share");
    expect(refuseOffer({ ...ok, terms: { ...terms, revenueSharePct: 100 } })).toBe("invalid-revenue-share");
  });

  it("refuses a missing unit rate — FEAT-048/049 can't make rupees without it", () => {
    expect(refuseOffer({ ...ok, terms: { ...terms, unitElectricityRate: 0 } })).toBe("invalid-unit-rate");
  });

  it("refuses a missing or fractional term", () => {
    expect(refuseOffer({ ...ok, terms: { ...terms, termMonths: 0 } })).toBe("invalid-term");
    expect(refuseOffer({ ...ok, terms: { ...terms, termMonths: 12.5 } })).toBe("invalid-term");
  });
});

describe("TC-027-5 — the CON-25 demo-skip path (FEAT-027-AC-5)", () => {
  const skip = {
    benchmarkSource: "negotiated_fixed" as const,
    demoReportId: null,
    negotiatedBenchmarkPct: 65,
    terms,
  };

  it("allows a negotiated offer with no demo report at all", () => {
    expect(refuseOffer(skip)).toBeNull();
  });

  it("requires the agreed percentage", () => {
    expect(refuseOffer({ ...skip, negotiatedBenchmarkPct: null })).toBe("no-benchmark-pct");
  });

  it("holds the negotiated percentage to CON-20's 60-80% range", () => {
    expect(refuseOffer({ ...skip, negotiatedBenchmarkPct: 59.99 })).toBe("no-benchmark-pct");
    expect(refuseOffer({ ...skip, negotiatedBenchmarkPct: 60 })).toBeNull();
    expect(refuseOffer({ ...skip, negotiatedBenchmarkPct: 80 })).toBeNull();
    expect(refuseOffer({ ...skip, negotiatedBenchmarkPct: 80.01 })).toBe("no-benchmark-pct");
  });
});

describe("TC-027-1 — projectedMonthlyFee (CON-11's split, party-named)", () => {
  // The whole point of these two assertions is *which party* the figure
  // belongs to. This exact split has been shipped inverted twice in this
  // project — once across nine places in a mockup deck, once in a Phase 9
  // unit test that asserted only the number.
  it("takes FirsThing's share as the remainder, not the society's share", () => {
    // 100 kWh/day saved × 30 days × ₹8 = ₹24,000 of value.
    // Society keeps 58% (₹13,920); FirsThing's fee is 42% = ₹10,080.
    const fee = projectedMonthlyFee({
      projectedSavedKwhPerDay: 100,
      unitElectricityRate: 8,
      societyRevenueSharePct: 58,
    });
    expect(fee).toBe(10_080);
    expect(fee).not.toBe(13_920); // the inversion this guards against
  });

  it("scales linearly with the saved energy", () => {
    expect(
      projectedMonthlyFee({ projectedSavedKwhPerDay: 50, unitElectricityRate: 8, societyRevenueSharePct: 58 }),
    ).toBe(5_040);
  });

  it("honours an explicit month length rather than assuming 30 days", () => {
    expect(
      projectedMonthlyFee({
        projectedSavedKwhPerDay: 100,
        unitElectricityRate: 8,
        societyRevenueSharePct: 58,
        daysInMonth: 31,
      }),
    ).toBeCloseTo(10_416, 10);
  });
});

describe("TC-108-1 — checkOfferResponse (GATE-04, FEAT-108-AC-1)", () => {
  const officeBearer = { id: "p1", role: "office_bearer", societyId: "soc-1" };
  const offer = { id: "o1", status: "issued", pipelineSocietyId: "soc-1" };

  it("allows the society's own office-bearer to respond", () => {
    expect(checkOfferResponse(officeBearer, offer).ok).toBe(true);
  });

  it("refuses a committee member — the binding act is the office-bearer's", () => {
    const r = checkOfferResponse({ ...officeBearer, role: "committee" }, offer);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe("not-office-bearer");
  });

  it("refuses a manager for the same reason", () => {
    const r = checkOfferResponse({ ...officeBearer, role: "manager" }, offer);
    expect(r.ok === false && r.reason).toBe("not-office-bearer");
  });

  it("refuses another society's office-bearer (INV-05)", () => {
    const r = checkOfferResponse({ ...officeBearer, societyId: "soc-2" }, offer);
    expect(r.ok === false && r.reason).toBe("wrong-society");
  });

  it("refuses a signed-out viewer", () => {
    expect(checkOfferResponse(null, offer).ok).toBe(false);
  });

  it("refuses responding twice — a second response is a counter, not an edit", () => {
    const r = checkOfferResponse(officeBearer, { ...offer, status: "accepted" });
    expect(r.ok === false && r.reason).toBe("not-issued");
  });

  it("refuses responding to a draft the back office is still editing", () => {
    const r = checkOfferResponse(officeBearer, { ...offer, status: "draft" });
    expect(r.ok === false && r.reason).toBe("not-issued");
  });
});
