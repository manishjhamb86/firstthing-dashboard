import { describe, expect, it } from "vitest";
import { zohoInvoiceMonth, zohoPaidProposal, zohoStatusFetched, zohoTime, zohoToExtraction } from "@/lib/zoho-invoice-map";
import type { ZohoInvoice } from "@/lib/zoho-invoice";

// Shaped on FT/2026-27/055 (Aditya Mega City, July 2026): one service line,
// 605 lights at ₹23.23 with Zoho's rounding discount, IGST 18%.
const INV: ZohoInvoice = {
  invoice_id: "460000000012345",
  invoice_number: "FT/2026-27/055",
  date: "2026-08-01",
  due_date: "2026-08-16",
  status: "sent",
  customer_name: "Aditya Mega City AOA",
  gst_no: "09AAAAA0000A1Z5",
  billing_address: { address: "Indirapuram", city: "Ghaziabad", state: "Uttar Pradesh", zip: "201014" },
  line_items: [
    {
      name: "Energy Efficiency services",
      description: "Savings share for 605 lights",
      hsn_or_sac: "998599",
      quantity: 605,
      rate: 23.23,
      discount_amount: 4.15,
      item_total: 14050,
      tax_percentage: 18,
      line_item_taxes: [{ tax_name: "IGST18", tax_amount: 2529 }],
    },
  ],
  sub_total: 14050,
  tax_total: 2529,
  total: 16579,
  balance: 16579,
  custom_fields: [{ label: "Invoice For The Month", value: "July-2026" }],
  last_modified_time: "2026-08-01T10:31:04+0530",
};

describe("zohoToExtraction", () => {
  it("carries Zoho's figures exactly, with their source named", () => {
    const x = zohoToExtraction(INV);
    expect(x.invoiceNumber.value).toBe("FT/2026-27/055");
    expect(x.invoiceDate.value).toBe("2026-08-01");
    expect(x.dueDate.value).toBe("2026-08-16");
    expect(x.invoiceForMonth.value).toBe("2026-07");
    expect(x.billToName.value).toBe("Aditya Mega City AOA");
    expect(x.billToGstin.value).toBe("09AAAAA0000A1Z5");
    expect(x.billToAddress.value).toBe("Indirapuram, Ghaziabad, Uttar Pradesh, 201014");
    expect(x.lines).toHaveLength(1);
    const l = x.lines[0];
    expect([l.qty.value, l.rate.value, l.discount.value, l.amount.value, l.taxPct.value, l.taxAmount.value]).toEqual([605, 23.23, 4.15, 14050, 18, 2529]);
    expect(l.hsn).toBe("998599");
    expect(l.kindProposal).toBe("service");
    expect(l.description).toBe("Energy Efficiency services — Savings share for 605 lights");
    expect([x.subtotal.value, x.taxAmount.value, x.taxPct.value, x.total.value, x.balanceDue.value]).toEqual([14050, 2529, 18, 16579, 16579]);
    expect(x.clarifications).toEqual([]);
    expect(x.total.sourceText).toBe("Zoho total");
  });

  it("proposes a goods line (a smart meter) as other, by its HSN", () => {
    const x = zohoToExtraction({ ...INV, line_items: [{ name: "Smart meter", hsn_or_sac: "90283010", quantity: 1, rate: 3000, item_total: 3000 }] });
    expect(x.lines[0].kindProposal).toBe("other");
    expect(x.lines[0].discount.value).toBe(0);
  });

  it("reads a percentage discount against the line's gross", () => {
    const x = zohoToExtraction({ ...INV, line_items: [{ name: "x", hsn_or_sac: "998599", quantity: 100, rate: 10, discount: "5%", item_total: 950 }] });
    expect(x.lines[0].discount.value).toBe(50);
  });

  it("sums split GST (CGST + SGST) into the line's tax", () => {
    const x = zohoToExtraction({
      ...INV,
      line_items: [{ name: "x", hsn_or_sac: "998599", quantity: 1, rate: 100, item_total: 100, tax_percentage: 18, line_item_taxes: [{ tax_amount: 9 }, { tax_amount: 9 }] }],
    });
    expect(x.lines[0].taxAmount.value).toBe(18);
  });

  it("leaves no single tax rate when lines differ", () => {
    const x = zohoToExtraction({
      ...INV,
      line_items: [
        { name: "a", hsn_or_sac: "998599", quantity: 1, rate: 1, item_total: 1, tax_percentage: 18 },
        { name: "b", hsn_or_sac: "9405", quantity: 1, rate: 1, item_total: 1, tax_percentage: 12 },
      ],
    });
    expect(x.taxPct.value).toBeNull();
  });
});

describe("zohoInvoiceMonth", () => {
  it("prefers a month custom field, then the reference, notes and lines — never the date", () => {
    expect(zohoInvoiceMonth(INV).value).toBe("2026-07");
    expect(zohoInvoiceMonth({ ...INV, custom_fields: [], reference_number: "Month: August-2026" }).value).toBe("2026-08");
    expect(zohoInvoiceMonth({ ...INV, custom_fields: [], line_items: [{ name: "Savings for June 2026" }] }).value).toBe("2026-06");
    const none = zohoInvoiceMonth({ ...INV, custom_fields: [], line_items: [{ name: "Energy Efficiency services" }] });
    expect(none.value).toBe("");
  });
});

describe("zohoPaidProposal", () => {
  it("proposes paid on the last payment date when settled in Zoho", () => {
    expect(zohoPaidProposal({ ...INV, status: "paid", balance: 0, last_payment_date: "2026-08-10" })).toEqual({ paid: "paid", paidOn: "2026-08-10" });
  });
  it("proposes unpaid while a balance is owed", () => {
    expect(zohoPaidProposal(INV)).toEqual({ paid: "unpaid", paidOn: "" });
    expect(zohoPaidProposal({ ...INV, status: "partially_paid", balance: 6579 })).toEqual({ paid: "unpaid", paidOn: "" });
  });
});

describe("statuses and times", () => {
  it("fetches everything but drafts and voids", () => {
    expect(["sent", "overdue", "paid", "partially_paid", "viewed", "unpaid"].every(zohoStatusFetched)).toBe(true);
    expect(zohoStatusFetched("draft")).toBe(false);
    expect(zohoStatusFetched("void")).toBe(false);
  });
  it("reads Zoho's +0530 timestamps as instants", () => {
    expect(zohoTime("2026-08-01T10:31:04+0530")?.toISOString()).toBe("2026-08-01T05:01:04.000Z");
    expect(zohoTime("nonsense")).toBeNull();
  });
});
