import { describe, expect, it } from "vitest";
import { billingStartFor, daysInMonthOf, prorateFirstMonth, proratedFirstInvoice } from "@/lib/billing-start";

describe("TC-037-5 — CON-22 billing start and proration (FEAT-037-AC-5)", () => {
  it("starts billing the day after signing, never the signing day", () => {
    expect(billingStartFor(new Date("2026-08-20T14:30:00Z")).toISOString()).toBe("2026-08-21T00:00:00.000Z");
  });

  it("matches SCR-064's own worked example to the day", () => {
    // "Signing today means billing starts tomorrow, 21 August. The first
    // invoice covers 21–31 August, 11 days."
    const p = prorateFirstMonth(new Date("2026-08-20T18:00:00Z"));
    expect(p.billingStart.toISOString().slice(0, 10)).toBe("2026-08-21");
    expect(p.proratedDays).toBe(11);
    expect(p.daysInMonth).toBe(31);
  });

  it("counts the billing start day itself — 21–31 is 11 days, not 10", () => {
    const p = prorateFirstMonth(new Date("2026-08-20T00:00:00Z"));
    expect(p.proratedDays).toBe(31 - 21 + 1);
  });

  it("bills a full month when signing on the last day of a month", () => {
    const p = prorateFirstMonth(new Date("2026-08-31T20:00:00Z"));
    expect(p.billingStart.toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(p.proratedDays).toBe(30);
    expect(p.daysInMonth).toBe(30);
    expect(p.fraction).toBe(1);
  });

  it("bills a single day when signing on the second-to-last day", () => {
    const p = prorateFirstMonth(new Date("2026-08-30T09:00:00Z"));
    expect(p.proratedDays).toBe(1);
    expect(p.fraction).toBeCloseTo(1 / 31, 12);
  });

  it("handles February, including a leap year", () => {
    expect(daysInMonthOf(new Date("2026-02-10T00:00:00Z"))).toBe(28);
    expect(daysInMonthOf(new Date("2028-02-10T00:00:00Z"))).toBe(29);
    const leap = prorateFirstMonth(new Date("2028-02-09T00:00:00Z"));
    expect(leap.proratedDays).toBe(29 - 10 + 1);
  });

  it("rolls a December signature into January", () => {
    const p = prorateFirstMonth(new Date("2026-12-31T23:00:00Z"));
    expect(p.billingStart.toISOString().slice(0, 10)).toBe("2027-01-01");
    expect(p.daysInMonth).toBe(31);
  });

  it("is unaffected by the time of day the certificate was signed", () => {
    const early = prorateFirstMonth(new Date("2026-08-20T00:00:01Z"));
    const late = prorateFirstMonth(new Date("2026-08-20T23:59:59Z"));
    expect(early).toEqual(late);
  });
});

describe("TC-037-5b — the rupee estimate shown before signing", () => {
  it("prorates the accepted monthly fee rather than recomputing one", () => {
    // ₹10,080/month (offer.test.ts's own worked figure) × 11/31 days
    const p = prorateFirstMonth(new Date("2026-08-20T18:00:00Z"));
    expect(proratedFirstInvoice(10_080, p)).toBeCloseTo(3576.7741935483873, 10);
  });

  it("does not round — rounding belongs to the invoice engine (INV-02)", () => {
    const p = prorateFirstMonth(new Date("2026-08-20T18:00:00Z"));
    const v = proratedFirstInvoice(10_080, p);
    expect(Number.isInteger(v)).toBe(false);
  });

  it("charges a full month's fee when the first month is whole", () => {
    const p = prorateFirstMonth(new Date("2026-08-31T10:00:00Z"));
    expect(proratedFirstInvoice(10_080, p)).toBe(10_080);
  });
});
