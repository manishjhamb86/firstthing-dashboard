/**
 * A Zoho Invoice record turned into the same `ExtractedInvoice` a PDF read
 * produces (2026-09-30), so a fetched invoice goes through exactly the review,
 * submit and release a dropped PDF does — one intake, two ways in.
 *
 * Pure: no network, no database. The difference from a PDF read is where the
 * figures come from — Zoho's own record, not a model reading a page — so each
 * figure's `sourceText` names the Zoho field it was taken from, and nothing
 * here asks a clarification: the figures are Zoho's, exactly.
 */

import type { ExtractedInvoice, ExtractedInvoiceLine } from "@/lib/invoice-extract";
import { parseInvoiceMonth } from "@/lib/invoice-intake";
import type { ZohoInvoice, ZohoLineItem } from "@/lib/zoho-invoice";

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

/** Statuses fetched into intake. A draft is not a bill yet; a void one never was. */
export function zohoStatusFetched(status: string): boolean {
  return !["draft", "void"].includes(status.toLowerCase());
}

/**
 * Which month the invoice bills — the operator still confirms it (INV-04).
 * FirsThing's invoices print it as "Invoice For The Month: July-2026"; in
 * Zoho that is a custom field, so a custom field whose label names a month
 * or period is read first, then the reference number, the notes, and the
 * line descriptions. Nothing found is "", never a guess from the date.
 */
export function zohoInvoiceMonth(inv: ZohoInvoice): { value: string; sourceText: string } {
  for (const f of inv.custom_fields ?? []) {
    if (/month|period/i.test(f.label ?? "")) {
      const text = String(f.value_formatted ?? f.value ?? "");
      const value = parseInvoiceMonth(text);
      if (value) return { value, sourceText: `Zoho custom field "${f.label}": ${text}` };
    }
  }
  const candidates: Array<[string, string | undefined]> = [
    ["reference number", inv.reference_number],
    ["notes", inv.notes],
    ...(inv.line_items ?? []).map((l, i): [string, string | undefined] => [`line ${i + 1}`, [l.name, l.description].filter(Boolean).join(" ")]),
  ];
  for (const [where, text] of candidates) {
    if (!text) continue;
    const m = text.match(/(?:for the month|month)\s*[:\-]?\s*([A-Za-z]{3,9}[\s\-\/,.]*\d{4})/i) ?? text.match(/\b([A-Za-z]{3,9}[\s\-]\d{4})\b/);
    const value = m ? parseInvoiceMonth(m[1]) : "";
    if (value) return { value, sourceText: `Zoho ${where}: ${m![0]}` };
  }
  return { value: "", sourceText: "" };
}

function lineDiscount(l: ZohoLineItem): number {
  const amount = num(l.discount_amount);
  if (amount !== null) return round2(amount);
  if (typeof l.discount === "string" && l.discount.trim().endsWith("%")) {
    const pct = num(l.discount.trim().slice(0, -1));
    const gross = (num(l.quantity) ?? 0) * (num(l.rate) ?? 0);
    return pct === null ? 0 : round2((gross * pct) / 100);
  }
  return round2(num(l.discount) ?? 0);
}

function lineTax(l: ZohoLineItem): number | null {
  const parts = (l.line_item_taxes ?? []).map((t) => num(t.tax_amount)).filter((x): x is number => x !== null);
  if (parts.length > 0) return round2(parts.reduce((a, b) => a + b, 0));
  const pct = num(l.tax_percentage);
  const total = num(l.item_total);
  return pct !== null && total !== null ? round2((total * pct) / 100) : null;
}

const fig = (value: number | null, field: string) => ({ value, sourceText: value === null ? "" : `Zoho ${field}` });
const txt = (value: string | undefined, field: string) => ({ value: value ?? "", sourceText: value ? `Zoho ${field}` : "" });

export function zohoToExtraction(inv: ZohoInvoice): ExtractedInvoice {
  const lines: ExtractedInvoiceLine[] = (inv.line_items ?? []).map((l, i) => {
    const hsn = (l.hsn_or_sac ?? "").trim();
    return {
      lineNo: i + 1,
      description: [l.name, l.description].filter((s) => s && s.trim()).join(" — "),
      hsn,
      qty: fig(num(l.quantity), "quantity"),
      rate: fig(num(l.rate), "rate"),
      discount: { value: lineDiscount(l), sourceText: "Zoho discount" },
      taxPct: fig(num(l.tax_percentage), "tax percentage"),
      taxAmount: fig(lineTax(l), "line taxes"),
      amount: fig(num(l.item_total), "item total"),
      // Chapter 99 is services; everything else is goods. classifyLine makes
      // the same call from the HSN, and the operator confirms it.
      kindProposal: hsn.startsWith("99") ? "service" : "other",
      sourceText: `Zoho line ${i + 1}`,
    };
  });
  const pcts = [...new Set(lines.map((l) => l.taxPct.value).filter((x): x is number => x !== null))];
  const taxTotal = num(inv.tax_total) ?? ((inv.taxes ?? []).length ? round2((inv.taxes ?? []).reduce((a, t) => a + (num(t.tax_amount) ?? 0), 0)) : null);
  const a = inv.billing_address ?? {};
  const address = [a.attention, a.address, a.street2, a.city, a.state, a.zip, a.country].filter((s) => s && String(s).trim()).join(", ");
  const month = zohoInvoiceMonth(inv);
  return {
    invoiceNumber: txt(inv.invoice_number, "invoice number"),
    invoiceDate: txt(inv.date, "invoice date"),
    dueDate: txt(inv.due_date, "due date"),
    invoiceForMonth: month,
    billToName: txt(inv.customer_name, "customer"),
    billToAddress: txt(address || undefined, "billing address"),
    billToGstin: txt(inv.gst_no, "customer GSTIN"),
    sellerName: { value: "", sourceText: "" },
    lines,
    subtotal: fig(num(inv.sub_total), "sub total"),
    taxAmount: fig(taxTotal, "tax total"),
    taxPct: fig(pcts.length === 1 ? pcts[0] : null, "tax percentage"),
    total: fig(num(inv.total), "total"),
    balanceDue: fig(num(inv.balance), "balance"),
    clarifications: [],
    notFound: month.value ? [] : ["invoiceForMonth"],
    notes: `Fetched from Zoho Invoice (status ${inv.status}${inv.last_modified_time ? `, last changed there ${inv.last_modified_time}` : ""}).`,
  };
}

/**
 * The payment status Zoho records, as a PROPOSAL for the review's paid
 * choice (CON-47 (e)) — the operator still confirms it. Paid in full in Zoho
 * proposes paid on the last payment date; anything with a balance proposes
 * unpaid.
 */
export function zohoPaidProposal(inv: ZohoInvoice): { paid: "paid" | "unpaid" | null; paidOn: string } {
  const balance = num(inv.balance);
  if (inv.status === "paid" || (balance !== null && balance <= 0 && (num(inv.total) ?? 0) > 0)) {
    return { paid: "paid", paidOn: /^\d{4}-\d{2}-\d{2}$/.test(inv.last_payment_date ?? "") ? inv.last_payment_date! : "" };
  }
  if (balance !== null && balance > 0) return { paid: "unpaid", paidOn: "" };
  return { paid: null, paidOn: "" };
}

/** Zoho's "2026-09-12T10:31:04+0530" as an instant; null when unreadable. */
export function zohoTime(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return Number.isNaN(d.getTime()) ? null : d;
}
