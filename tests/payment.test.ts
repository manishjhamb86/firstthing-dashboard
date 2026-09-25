import { describe, expect, it } from "vitest";
import { isSettled, refusePayment, settledTotal, tdsFromRate } from "@/lib/payment";

const base = { amount: 14_050, tdsAmount: 0, method: "bank_transfer" as const, utrNumber: "HDFC0012345678", chequeNumber: "", chequeDate: "", chequeBank: "" };

describe("payments with TDS", () => {
  it("TDS counts towards settling: ₹16,579 invoice, ₹16,298 received + ₹281 TDS", () => {
    expect(settledTotal([{ amount: 16_298, tdsAmount: 281 }])).toBe(16_579);
    expect(isSettled(16_579, [{ amount: 16_298, tdsAmount: 281 }])).toBe(true);
    expect(isSettled(16_579, [{ amount: 16_298 }])).toBe(false);
  });
  it("TDS from a rate is on the value before GST, to the rupee", () => expect(tdsFromRate(14_050, 2)).toBe(281));
  it("a bank transfer needs its UTR; a cheque its number, date and bank", () => {
    expect(refusePayment(base, 16_579)).toBeNull();
    expect(refusePayment({ ...base, utrNumber: "" }, 16_579)).toMatch(/UTR/);
    expect(refusePayment({ ...base, method: "cheque", utrNumber: "" }, 16_579)).toMatch(/cheque number/);
    expect(refusePayment({ ...base, method: "cheque", chequeNumber: "004512", chequeDate: "2026-09-20", chequeBank: "SBI" }, 16_579)).toBeNull();
  });
  it("TDS alone is allowed (the certificate arrives after the money)", () =>
    expect(refusePayment({ ...base, amount: 0, tdsAmount: 281, utrNumber: "" }, 281)).toBeNull());
  it("refuses settling more than is outstanding", () => expect(refusePayment({ ...base, amount: 20_000 }, 16_579)).toMatch(/outstanding/));
});
