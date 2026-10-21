import { describe, expect, it } from "vitest";
import {
  paymentRating,
  qualifiesToEnter,
  qualifiesToStay,
  rateInvoice,
  settledOn,
  starSummary,
  starsFor,
  type RatingInvoice,
} from "@/lib/payment-rating";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const asOf = d("2026-10-21");

function inv(n: number, due: string, paid: Array<[string, number, number?]>, amount = 16_579, extensionDays = 0): RatingInvoice {
  return {
    id: `i${n}`,
    number: `FT/${n}`,
    amount,
    dueDate: d(due),
    extensionDays,
    payments: paid.map(([on, a, tds]) => ({ amount: a, tdsAmount: tds ?? 0, confirmedAsOf: d(on) })),
  };
}

describe("settledOn", () => {
  it("is the day the last rupee arrived, counting TDS", () => {
    expect(settledOn(inv(1, "2026-08-15", [["2026-08-10", 10_000], ["2026-08-20", 6_298, 281]]))).toEqual(d("2026-08-20"));
  });
  it("is null while anything is outstanding", () => {
    expect(settledOn(inv(1, "2026-08-15", [["2026-08-10", 10_000]]))).toBeNull();
  });
});

describe("rateInvoice", () => {
  it("counts days after the due date, never negative", () => {
    expect(rateInvoice(inv(1, "2026-08-15", [["2026-08-10", 16_579]]), asOf)?.daysLate).toBe(0);
    expect(rateInvoice(inv(1, "2026-08-15", [["2026-08-25", 16_579]]), asOf)?.daysLate).toBe(10);
  });
  it("moves the due date by an extension", () => {
    const r = rateInvoice(inv(1, "2026-08-15", [["2026-08-25", 16_579]], 16_579, 10), asOf);
    expect(r?.daysLate).toBe(0);
    expect(r?.onTime).toBe(true);
  });
  it("counts an unpaid overdue invoice by its days overdue so far", () => {
    const r = rateInvoice(inv(1, "2026-10-01", []), asOf);
    expect(r).toMatchObject({ open: true, daysLate: 20, settledOn: null });
  });
  it("leaves out an unpaid invoice not yet due", () => {
    expect(rateInvoice(inv(1, "2026-11-01", []), asOf)).toBeNull();
  });
});

describe("paymentRating", () => {
  it("is not rated below the minimum history", () => {
    const r = paymentRating([inv(1, "2026-08-15", [["2026-08-10", 16_579]]), inv(2, "2026-09-15", [["2026-09-10", 16_579]])], asOf);
    expect(r.stars).toBeNull();
    expect(r.counted).toBe(2);
    expect(starSummary(r)).toBeNull();
  });
  it("gives 5 stars to a society that always pays on time", () => {
    const r = paymentRating(
      [
        inv(1, "2026-07-15", [["2026-07-14", 16_579]]),
        inv(2, "2026-08-15", [["2026-08-16", 16_579]]),
        inv(3, "2026-09-15", [["2026-09-10", 16_579]]),
      ],
      asOf,
    );
    expect(r.stars).toBe(5);
    expect(qualifiesToEnter(r)).toBe(true);
    expect(starSummary(r)).toBe("Paid all 3 invoices on time since July 2026.");
  });
  it("weights the average by amount", () => {
    // 10 days late on ₹30,000 and on time on two ₹10,000 bills → 6 days.
    const r = paymentRating(
      [
        inv(1, "2026-07-15", [["2026-07-25", 30_000]], 30_000),
        inv(2, "2026-08-15", [["2026-08-15", 10_000]], 10_000),
        inv(3, "2026-09-15", [["2026-09-15", 10_000]], 10_000),
      ],
      asOf,
    );
    expect(r.avgDaysLate).toBe(6);
    expect(r.stars).toBe(4);
    expect(qualifiesToEnter(r)).toBe(false);
    expect(qualifiesToStay(r)).toBe(true);
    expect(starSummary(r)).toBe("Paid 2 of 3 invoices on time since July 2026.");
  });
  it("caps at 2 stars while a bill is unpaid more than 30 days", () => {
    const paid = Array.from({ length: 10 }, (_, k) =>
      inv(k, `2026-0${(k % 6) + 1}-0${(k % 9) + 1}`, [[`2026-0${(k % 6) + 1}-0${(k % 9) + 1}`, 100_000]], 100_000),
    );
    const r = paymentRating([...paid, inv(99, "2026-09-01", [], 1_000)], asOf);
    expect(r.avgDaysLate).toBeLessThan(2);
    expect(r.stars).toBe(2);
    expect(r.capped).toBe(true);
    expect(qualifiesToStay(r)).toBe(false);
  });
  it("leaves out invoices due more than a year ago", () => {
    const r = paymentRating(
      [inv(1, "2025-09-01", [["2025-12-01", 16_579]]), inv(2, "2026-08-15", [["2026-08-15", 16_579]])],
      asOf,
    );
    expect(r.counted).toBe(1);
  });
});

describe("starsFor", () => {
  it("follows the published bands", () => {
    expect([0, 2, 2.1, 7, 15, 30, 31].map(starsFor)).toEqual([5, 5, 4, 4, 3, 2, 1]);
  });
});
