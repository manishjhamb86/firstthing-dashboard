import { describe, expect, it } from "vitest";
import {
  matchRetailCustomer,
  refuseRetailCustomer,
  refuseRetailInvoice,
  refuseRetailPayment,
  retailInvoicePaidTotal,
  retailInvoiceSettled,
  retailNameKey,
} from "@/lib/retail-customer";

const blank = { name: "", gstin: "", address: "", phone: "", email: "" };

describe("retail customers", () => {
  it("normalises the name so spelling of case and spacing is one customer", () => {
    expect(retailNameKey("  PARK VIEW  Residency. ")).toBe(retailNameKey("Park View Residency"));
  });
  it("needs a name; a GSTIN is optional but must be one", () => {
    expect(refuseRetailCustomer(blank)).toMatch(/name/);
    expect(refuseRetailCustomer({ ...blank, name: "Park View Residency" })).toBeNull();
    expect(refuseRetailCustomer({ ...blank, name: "X", gstin: "06AADAP0184A1Z3" })).toBeNull();
    expect(refuseRetailCustomer({ ...blank, name: "X", gstin: "1234" })).toMatch(/not a GSTIN/);
  });
  it("matches an invoice's bill-to by GSTIN first, then by name", () => {
    const customers = [
      { id: "a", nameKey: "park view residency", gstin: null },
      { id: "b", nameKey: "other name", gstin: "06AADAP0184A1Z3" },
    ];
    expect(matchRetailCustomer({ name: "Anything", gstin: "06aadap0184a1z3" }, customers)).toBe("b");
    expect(matchRetailCustomer({ name: "PARK VIEW RESIDENCY", gstin: "" }, customers)).toBe("a");
    expect(matchRetailCustomer({ name: "Someone new", gstin: "" }, customers)).toBeNull();
  });
});

const blankInvoice = { invoiceNumber: "", period: "", total: "", subtotal: "", taxAmount: "" };

describe("a hand-entered retail invoice", () => {
  it("needs a number, a month and a total", () => {
    expect(refuseRetailInvoice(blankInvoice)).toMatch(/invoice number/);
    expect(refuseRetailInvoice({ ...blankInvoice, invoiceNumber: "INV-1" })).toMatch(/month/);
    expect(refuseRetailInvoice({ ...blankInvoice, invoiceNumber: "INV-1", period: "2026-09" })).toMatch(/total/);
    expect(refuseRetailInvoice({ ...blankInvoice, invoiceNumber: "INV-1", period: "2026-09", total: "1000" })).toBeNull();
  });
  it("refuses a negative subtotal or tax", () => {
    const ok = { invoiceNumber: "INV-1", period: "2026-09", total: "1000" };
    expect(refuseRetailInvoice({ ...ok, subtotal: "-1", taxAmount: "" })).toMatch(/subtotal/);
    expect(refuseRetailInvoice({ ...ok, subtotal: "", taxAmount: "-1" })).toMatch(/tax/);
  });
});

describe("a payment against a retail invoice", () => {
  it("needs a real amount and a date", () => {
    expect(refuseRetailPayment({ amount: "", paidOn: "" }, 1000)).toMatch(/received/);
    expect(refuseRetailPayment({ amount: "500", paidOn: "" }, 1000)).toMatch(/date/);
    expect(refuseRetailPayment({ amount: "500", paidOn: "2026-09-15" }, 1000)).toBeNull();
  });
  it("refuses a payment larger than what is still outstanding", () => {
    expect(refuseRetailPayment({ amount: "1500", paidOn: "2026-09-15" }, 1000)).toMatch(/outstanding/);
    // A trailing-paisa rounding difference is not a real overpayment.
    expect(refuseRetailPayment({ amount: "1000.2", paidOn: "2026-09-15" }, 1000)).toBeNull();
  });
});

describe("what a retail invoice has settled", () => {
  it("sums the payment ledger", () => {
    const invoice = { total: 1000, advanceAmount: null };
    expect(retailInvoicePaidTotal(invoice, [{ amount: 400 }, { amount: 600 }])).toBe(1000);
    expect(retailInvoiceSettled(invoice, [{ amount: 400 }, { amount: 600 }])).toBe(true);
    expect(retailInvoiceSettled(invoice, [{ amount: 400 }])).toBe(false);
  });
  it("falls back to the pre-ledger advance only when no payment has ever been recorded", () => {
    const invoice = { total: 1000, advanceAmount: 300 };
    expect(retailInvoicePaidTotal(invoice, [])).toBe(300);
    // Once a real payment lands, the advance is superseded by the ledger —
    // it must not be double-counted alongside it.
    expect(retailInvoicePaidTotal(invoice, [{ amount: 1000 }])).toBe(1000);
  });
});
