/**
 * Small, pure reads of a Zoho Invoice record — what a PDF read genuinely
 * can't say (the month it bills, Zoho's own recorded payment status) or
 * doesn't need to (whether the fetch should run at all, parsing a Zoho
 * timestamp). The figures themselves come from reading the fetched PDF the
 * same way an uploaded one is read (2026-10-02, user-asked) — this module
 * no longer maps Zoho's line items into an `ExtractedInvoice` directly; see
 * `src/lib/zoho-invoice-sync.ts`'s `fillFromZoho`.
 */

import { parseInvoiceMonth } from "@/lib/invoice-intake";
import type { ZohoInvoice } from "@/lib/zoho-invoice";

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
