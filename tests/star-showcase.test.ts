import { describe, expect, it } from "vitest";
import { paymentRating, type RatingInvoice } from "@/lib/payment-rating";
import { isCandidate, isLive, refuseApproval, refuseConsent, showcaseExpiry, stillShowable } from "@/lib/star-showcase";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const now = d("2026-10-21");
const paidOnTime = (n: number, due: string): RatingInvoice => ({
  id: `i${n}`, number: `FT/${n}`, amount: 10_000, dueDate: d(due), extensionDays: 0,
  payments: [{ amount: 10_000, tdsAmount: 0, confirmedAsOf: d(due) }],
});
const unpaid = (n: number, due: string): RatingInvoice => ({ ...paidOnTime(n, due), payments: [] });

const five = paymentRating([paidOnTime(1, "2026-07-15"), paidOnTime(2, "2026-08-15"), paidOnTime(3, "2026-09-15")], now);
const overdue = paymentRating([paidOnTime(1, "2026-07-15"), paidOnTime(2, "2026-08-15"), unpaid(3, "2026-10-10")], now);
const unrated = paymentRating([], now);
const facts = { closed: false, markedDefaulter: false, hasConsent: true };

describe("isCandidate", () => {
  it("raises a 5-star society with nothing listed", () => {
    expect(isCandidate(five, facts, [], now)).toBe(true);
  });
  it("does not raise one with a bill past due, a defaulter mark, or a closed engagement", () => {
    expect(isCandidate(overdue, facts, [], now)).toBe(false);
    expect(isCandidate(five, { ...facts, markedDefaulter: true }, [], now)).toBe(false);
    expect(isCandidate(five, { ...facts, closed: true }, [], now)).toBe(false);
  });
  it("does not raise one already live or pending", () => {
    expect(isCandidate(five, facts, [{ status: "approved", expiresAt: d("2026-12-01"), decidedAt: d("2026-09-01") }], now)).toBe(false);
    expect(isCandidate(five, facts, [{ status: "proposed", expiresAt: null, decidedAt: null }], now)).toBe(false);
  });
  it("raises again once a listing has expired", () => {
    expect(isCandidate(five, facts, [{ status: "approved", expiresAt: d("2026-10-01"), decidedAt: d("2026-07-01") }], now)).toBe(true);
  });
  it("stays quiet for 90 days after a rejection", () => {
    expect(isCandidate(five, facts, [{ status: "rejected", expiresAt: null, decidedAt: d("2026-09-01") }], now)).toBe(false);
    expect(isCandidate(five, facts, [{ status: "rejected", expiresAt: null, decidedAt: d("2026-06-01") }], now)).toBe(true);
  });
});

describe("refuseApproval", () => {
  const base = { origin: "auto" as const, rating: five, facts, approverId: "a1", proposedById: null };
  it("approves a qualifying society with consent", () => {
    expect(refuseApproval(base)).toBeNull();
  });
  it("refuses without consent", () => {
    expect(refuseApproval({ ...base, facts: { ...facts, hasConsent: false } })).toMatch(/consent/);
  });
  it("refuses the proposer approving their own manual proposal", () => {
    expect(refuseApproval({ ...base, origin: "manual", proposedById: "a1" })).toMatch(/another admin/);
  });
  it("lets a different admin approve a manual proposal for an unrated society", () => {
    expect(refuseApproval({ ...base, origin: "manual", rating: unrated, proposedById: "a2" })).toBeNull();
  });
  it("refuses once a bill is past due, whatever the origin", () => {
    expect(refuseApproval({ ...base, rating: overdue })).toMatch(/no longer qualifies/);
    expect(refuseApproval({ ...base, origin: "manual", rating: overdue, proposedById: "a2" })).toMatch(/past due/);
  });
});

describe("stillShowable", () => {
  it("hides a listed society that falls behind or withdraws consent", () => {
    expect(stillShowable(five, facts)).toBeNull();
    expect(stillShowable(overdue, facts)).toMatch(/past due/);
    expect(stillShowable(five, { ...facts, hasConsent: false })).toMatch(/consent/);
  });
});

describe("isLive / expiry / consent", () => {
  it("expires 90 days after approval", () => {
    const exp = showcaseExpiry(d("2026-10-01"));
    expect(exp.toISOString().slice(0, 10)).toBe("2026-12-30");
    expect(isLive({ status: "approved", expiresAt: exp }, now)).toBe(true);
    expect(isLive({ status: "approved", expiresAt: exp }, d("2026-12-31"))).toBe(false);
  });
  it("needs who agreed and a past date", () => {
    expect(refuseConsent(" ", d("2026-10-01"), now)).toMatch(/who/);
    expect(refuseConsent("Asha Rao, Secretary", d("2026-11-01"), now)).toMatch(/future/);
    expect(refuseConsent("Asha Rao, Secretary", d("2026-10-01"), now)).toBeNull();
  });
});
